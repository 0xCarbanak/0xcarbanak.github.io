# Dude, Where's my DLL?

*Automating DLL hijack discovery with omnispex*

![Dude, Where's my DLL?](/images/dude-wheres-my-dll.png)

Finding DLL search order hijacking opportunities by hand is tedious. The companion post on [tracing DLL loads on Windows](#blog/2026-11-26-tracing-dll-loads-on-windows) walked through the manual process: open the target in PE-bear, read the import table, set up Procmon filters, capture a startup trace, check each DLL path, read the export table, and repeat for every dependency. It works, but it does not scale. A single executable can import dozens of DLLs, each with its own chain of transitive dependencies.

[Omnispex](https://github.com/0xCarbanak/omnispex) automates all of that. It parses PE imports, walks the Windows DLL search order, optionally launches the target under the Debug API to capture runtime loads, follows recursive import chains, enumerates exports, and grades each finding by stealth. The output is a ranked table of hijackable DLLs sorted so the best targets appear first.

This post covers installation, basic usage, every classification and scoring factor, and practical examples that connect directly to the manual evidence from the companion post.

## Why DLL hijack discovery matters for red teams

DLL search order hijacking is one of the most reliable persistence and execution techniques on Windows. When an application loads a DLL by name without a full path, Windows searches a predictable sequence of directories. If an attacker can place a crafted DLL earlier in that search order -- typically in the application directory -- the loader maps the attacker's file instead of the legitimate one.

The technique is valuable because it piggybacks on a signed, trusted executable. The process that loads the malicious DLL is the vendor's own binary, often with a valid Authenticode signature. EDR products that allow-list by process name or signer see normal-looking behavior. The proxy DLL forwards every exported function to the real DLL, so the application runs correctly and the user notices nothing.

The hard part is not writing the proxy DLL. The hard part is finding which DLLs are hijackable in a given target, how many exports need forwarding, whether EDR products monitor those particular DLLs, and whether the dependency comes from a direct import or a fragile transitive chain. That is what omnispex answers.

## Installation

### Download a release binary

Grab the latest `.exe` from the [GitHub releases page](https://github.com/0xCarbanak/omnispex/releases). The binary is a standalone ~535KB executable with no runtime dependencies. Drop it anywhere on your analysis machine.

### Build from source

If you prefer to compile it yourself, clone the repository and build with Cargo. On Windows:

```
git clone https://github.com/0xCarbanak/omnispex.git
cd omnispex
cargo build --release
```

The binary lands in `target\release\omnispex.exe`.

Cross-compiling from Linux targets the MinGW toolchain:

```bash
cargo build --release --target x86_64-pc-windows-gnu
```

## Basic usage

Point omnispex at any PE executable:

```
omnispex.exe C:\Temp\npp\notepad++.exe
```

The output starts with a header showing PE metadata parsed from the target -- architecture, signature status, version info, and import count -- followed by the findings table:

```
  OMNISPEX
  --------

  Target:       C:\Temp\npp\notepad++.exe
  App dir:      C:\Temp\npp
  Architecture: x64 (GUI)
  Signed:       YES (Notepad++)
  Company:      Don HO don.h@free.fr
  Description:  Notepad++
  File version: 8.6.8
  Product:      Notepad++
  Original:     notepad++.exe
  Static imports:  19

  Found 9 hijackable DLLs:

  CLASS          DLL                            SOURCE   STEALTH  DETAILS
  -----          ---                            ------   -------  -------
  [!] PHANTOM    sensapi.dll                    static   HIGH     Not in app dir [3 exports]
                 stealth: 3 exports (trivial proxy), direct import
  [!] PHANTOM    version.dll                    static   HIGH     Not in app dir [17 exports]
                 stealth: 17 exports, direct import
  [!] PHANTOM    dwmapi.dll                     static   MED      Not in app dir [101 exports]
                 stealth: 101 exports (complex proxy), direct import
  [!] PHANTOM    crypt32.dll                    static   LOW      Not in app dir [307 exports]
                 stealth: 307 exports (massive proxy), EDR-watched, direct import
  [!] PHANTOM    wininet.dll                    static   LOW      Not in app dir [327 exports]
                 stealth: 327 exports (massive proxy), EDR-watched, direct import
```

### Reading the output columns

Each row represents one DLL. The five columns tell you everything you need to decide whether to target it:

| Column | Meaning |
| --- | --- |
| **CLASS** | The hijack category -- how the DLL is loaded and what that means for exploitation |
| **DLL** | The filename the application imports |
| **SOURCE** | Whether the import was found in the PE header (`static`) or observed at runtime (`dynamic`) |
| **STEALTH** | A practical grade (HIGH, MED, LOW) for how covert and reliable the hijack would be |
| **DETAILS** | Export count, EDR flags, chain information, and other context |

The PE metadata header above the table is useful for confirming you have the right target. The architecture and subsystem tell you whether to build a 32-bit or 64-bit proxy. The signature status and signer name let you verify the binary is the original vendor release.

## Classification system

Omnispex assigns one of five classes to every DLL it encounters. The class determines whether and how the DLL can be hijacked.

### MISSING

The DLL is not found anywhere in the search path. No resolution -- the loader will search every directory in order and fail. To exploit this, place your DLL with that filename in the application directory. Because there is no original to proxy, you do not need to forward any exports. This is the simplest hijack.

### PHANTOM

The DLL exists in System32 (or another system directory), but the application directory is searched first. When the loader walks the standard search order, it checks the application directory before System32. If you plant a proxy DLL in the application directory, Windows loads yours instead of the system copy. The proxy needs to forward the original exports to the real DLL so the application continues working.

This is the most common class for hijackable DLLs. In the Notepad++ example above, `sensapi.dll` and `version.dll` are both PHANTOM DLLs -- they resolve from System32, but the app directory comes first in the search order.

### SIDELOAD

The DLL already exists in the application directory. The original file is right there, so replacing it is the attack. If the directory is writable and the application does not verify the DLL's integrity, you can swap the original for a proxy that forwards to a renamed copy. This requires write access to the application directory and a bit more setup than PHANTOM, since you need to rename the original and point your proxy at the new name.

### KNOWN_DLL

The DLL is listed in the Windows KnownDLLs registry key (`HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\KnownDLLs`). The loader maps these from a cached section object rather than searching the filesystem. No amount of directory manipulation will redirect the load. These are not hijackable and are filtered from the default output.

### SAFE

API sets (`api-ms-win-*`, `ext-ms-win-*`) and loader-critical DLLs (`ntdll.dll`, `kernelbase.dll`, `kernel32.dll`) fall into this category. They resolve through mechanisms that bypass the normal search order entirely. Also filtered from the default output.

Use `--show-all` to include KNOWN_DLL and SAFE entries in the results if you want the complete picture.

## Stealth scoring

Each hijackable DLL receives a stealth grade -- HIGH, MED, or LOW -- based on multiple factors that determine how practical and covert the hijack would be in a real engagement.

| Factor | Effect on score | Reasoning |
| --- | --- | --- |
| Export count | Fewer exports = higher stealth | A proxy DLL forwarding 3 exports is trivial to build and test. One forwarding 300+ is fragile and time-consuming. |
| EDR monitoring | Penalty | DLLs like `crypt32.dll`, `wintrust.dll`, `bcrypt.dll`, `wininet.dll`, `winhttp.dll`, `urlmon.dll`, `amsi.dll`, `dbghelp.dll`, `ws2_32.dll`, and `dnsapi.dll` are heavily hooked by EDR products. Hijacking them draws scrutiny. |
| SxS redirection | Heavy penalty | If the executable's manifest declares a Side-by-Side assembly dependency, the loader resolves the DLL from `WinSxS` instead of the app directory, making hijacking impossible for that DLL. |
| Delay-load | Bonus | Delay-loaded DLLs are resolved lazily when first used, not at startup. If the proxy has issues, the application is less likely to crash immediately. |
| Chain depth | Direct import > deep chain | Direct imports load reliably at startup. A DLL discovered three levels deep in the import chain depends on a fragile sequence of transitive loads. |
| Class | MISSING > PHANTOM | MISSING DLLs need no proxy at all. PHANTOM DLLs require a working proxy that forwards all exports. |

Results are sorted by class first, then by stealth within each class. The best targets always float to the top. In the Notepad++ output, `sensapi.dll` appears first: it is PHANTOM with only 3 exports, no EDR attention, and a direct static import. That is about as good as it gets.

## Modes of operation

Omnispex supports four analysis modes, each with a different tradeoff between speed and coverage.

| Mode | Flag | What it does |
| --- | --- | --- |
| Local | `--local` | PE parsing plus app directory check only. No search order walk, no process launch. The fastest option. |
| Static | `--static-only` | PE parsing plus full DLL search order walk. No process execution. Finds everything the filesystem can tell you. |
| Full | *(default)* | Static analysis plus dynamic debugging. Launches the target under the Debug API to capture runtime `LoadLibrary` calls. Catches DLLs loaded by code paths that only execute at runtime. |
| Batch | `--scan-dir <path>` | Scans all executables in a directory recursively. Runs static analysis on each and ranks the results by hijackable count. |

The default full mode launches the target as a debuggee and waits for DLL load events. Use `--timeout <secs>` to control how long the debug session runs (default: 30 seconds). Pass `--args <str>` to supply command-line arguments to the target during dynamic analysis.

## Advanced flags

### `--local` -- fast app directory check

```
omnispex.exe C:\Temp\npp\notepad++.exe --local
```

Skips both the search order walk and the debugger. Only checks whether each imported DLL exists in the application directory. This is the fastest mode and produces no process execution artifacts. Use it when you already know the app directory is writable and you just need the import list with export counts.

### `--exports` -- enumerate exports for proxy DLL building

```
omnispex.exe C:\Temp\npp\notepad++.exe --local --exports
```

Reads the PE export table of each hijackable DLL and lists every exported function with its ordinal, name, and forwarding target. This is the data you need to write the `.def` file for a proxy DLL. For each DLL, the output shows the total export count, ordinal-only exports, forwarded exports, and every individual function.

### `--depth N` -- recursive import chain walking

```
omnispex.exe C:\Temp\npp\notepad++.exe --local --depth 3 -v
```

The default depth of 1 checks only the target's direct imports. With `--depth 3`, omnispex reads the PE of each resolved DLL and walks its imports recursively using BFS. It finds the shortest path from the target to each discovered DLL and reports it as a chain.

### `--scan-dir` -- batch scan an entire directory

```
omnispex.exe --scan-dir "C:\Program Files\SomeVendor" --local
```

Recursively finds all `.exe` files (up to 10 levels deep), runs static analysis on each, and outputs a ranked table sorted by hijackable count. Useful for triaging which applications in an environment have the most hijacking surface.

### `--json` -- machine-readable output

```
omnispex.exe C:\Temp\npp\notepad++.exe --local --exports --json
```

Outputs the full results as JSON. Export data is included in the JSON output, making it easy to feed into proxy DLL generators or C2 builders.

### `-v` -- verbose output

```
omnispex.exe C:\Temp\npp\notepad++.exe -v
```

Shows the search order being walked, chain walk progress, and per-module details. Useful for understanding why a particular DLL received a specific classification.

## Practical example: scanning Notepad++ portable

The companion post traced `version.dll` by hand through PE-bear and Procmon. Let us run the same target through omnispex and see how the automated results map to the manual evidence.

### Run the scan

```
omnispex.exe C:\Temp\npp\notepad++.exe
```

The output (shown in the basic usage section above) finds 9 hijackable DLLs. Focus on the top two:

**sensapi.dll** -- PHANTOM, HIGH stealth, 3 exports. This DLL provides network connectivity status functions. It resolves from System32, but the application directory is searched first. With only 3 exports, all pointing to local code (no forwarded entries), writing a proxy is trivial. Each export forwards to the real `C:\Windows\System32\sensapi.dll` and you have full execution in the DLL's `DllMain`.

**version.dll** -- PHANTOM, HIGH stealth, 17 exports. The companion post showed exactly this: PE-bear listed 17 exports, Procmon recorded `NAME NOT FOUND` in the app directory followed by `SUCCESS` from System32, and the Load Image event confirmed the mapped file. The PHANTOM classification captures that entire sequence in one word -- the DLL exists in System32, the app directory is searched first, and there is no copy in the app directory to compete with a planted proxy.

### Why these results match the manual trace

| Manual evidence | Omnispex equivalent |
| --- | --- |
| PE-bear shows `version.dll` in the import table | SOURCE: `static` |
| Procmon records `NAME NOT FOUND` in app dir, then `SUCCESS` from System32 | CLASS: `PHANTOM` |
| PE-bear's export tab shows 17 entries | DETAILS: `[17 exports]` |
| Stack trace shows `NtMapViewOfSection` from a worker thread | Full mode captures this via Debug API |

The tool reaches the same conclusions across all 19 imports simultaneously, without manually configuring a single Procmon filter.

## Using `--exports` for proxy DLL building

Once you have identified a target DLL, the next step is building the proxy. The proxy must export every function the application imports and forward each call to the real DLL. The `--exports` flag gives you exactly this information.

```
omnispex.exe C:\Temp\npp\notepad++.exe --local --exports
```

For `sensapi.dll`, the output lists all 3 exports with their ordinals and names. For `version.dll`, it lists all 17 exports, including which ones are forwarded (like `VerLanguageNameA` forwarding to `KERNEL32.VerLanguageNameA`) and which point to local code (like `GetFileVersionInfoW`).

This output maps directly to a `.def` file for the proxy DLL:

```def
LIBRARY sensapi
EXPORTS
    IsDestinationReachableA=C:\Windows\System32\sensapi.IsDestinationReachableA @1
    IsDestinationReachableW=C:\Windows\System32\sensapi.IsDestinationReachableW @2
    IsNetworkAlive=C:\Windows\System32\sensapi.IsNetworkAlive @3
```

Each line names the function, points it at the real DLL's export, and preserves the ordinal. The proxy DLL's `DllMain` runs your payload, while every legitimate call passes through to the original.

For machine consumption, combine `--exports` with `--json` to get structured data you can feed directly into a proxy generator script.

## Following import chains with `--depth`

Direct imports are only part of the story. When `version.dll` loads, it imports its own dependencies. Those transitive DLLs also load into the process, and if they are PHANTOM, they are plantable in the app directory.

### Depth 1 (default)

At depth 1, omnispex checks only the 19 DLLs in the target's direct import table. This is fast and covers the most reliable hijack opportunities.

### Depth 3 and beyond

```
omnispex.exe C:\Temp\npp\notepad++.exe --local --depth 3 -v
```

With `--depth 3`, the tool reads each resolved DLL's PE headers and walks their imports recursively. It uses BFS to discover the shortest path from the target to each new DLL. The output includes chain information for every transitive finding:

```
  [!] PHANTOM    userenv.dll                    static   Not in app dir - plant here to hijack
                 chain: notepad++.exe -> version.dll -> userenv.dll
  [!] PHANTOM    bcrypt.dll                     static   Not in app dir - plant here to hijack
                 chain: notepad++.exe -> version.dll -> bcrypt.dll
```

`userenv.dll` does not appear in Notepad++'s direct import table. But `version.dll` imports it, so it loads into the process transitively. If the app directory is writable, a proxy `userenv.dll` planted there will be found before the System32 copy.

### Tradeoffs of deep chains

Deeper chains surface more targets but with caveats. A DLL three levels deep depends on the entire chain loading in order. If any link in the chain is a KnownDLL or resolves through a mechanism that skips the filesystem search, the transitive dependency may not load from the app directory. The stealth score accounts for chain depth -- direct imports score higher than deep transitive ones.

Use `--depth 3` as a reasonable starting point for thorough analysis. Beyond that, the results grow rapidly and the marginal findings become increasingly fragile.

## Batch scanning

When assessing an environment, you rarely care about a single executable. The `--scan-dir` flag processes every `.exe` in a directory tree:

```
omnispex.exe --scan-dir "C:\Temp\npp" --local
```

```
  OMNISPEX - BATCH SCAN
  ---------------------

  Scan dir:           C:\Temp\npp
  Total executables:  2
  With findings:      2

  RANK  BEST CLASS     HITS  CHAIN TARGET
  ----  ----------     ----  ----- ------
  1     PHANTOM        12    yes   C:\Temp\npp\notepad++.exe
                             crypt32.dll (PHANTOM)
                             wintrust.dll (PHANTOM)
                             comctl32.dll (PHANTOM)
                             bcrypt.dll (PHANTOM)
                             dwmapi.dll (PHANTOM)
  2     PHANTOM        4     yes   C:\Temp\npp\updater\GUP.exe
                             bcrypt.dll (PHANTOM)
                             crypt32.dll (PHANTOM)
                             comctl32.dll (PHANTOM)
                             libcurl.dll (SIDELOAD)
```

The table ranks executables by hijackable count. The top 5 DLLs per target are listed inline. This lets you quickly identify which applications have the widest hijacking surface and focus your effort on the most promising targets.

## Putting it together

The workflow for a red team engagement looks like this:

1. **Identify targets.** Use `--scan-dir` with `--local` to triage an application directory or an entire Program Files tree. Find executables with HIGH-stealth PHANTOM or MISSING DLLs.
2. **Analyze the best candidate.** Run omnispex against the top-ranked executable with `--exports` to get the full export list. Check the stealth score and confirm the app directory is writable.
3. **Follow the chains.** Add `--depth 3` to find transitive dependencies that might offer better stealth or fewer exports than the direct imports.
4. **Build the proxy.** Use the `--exports` output to write the `.def` file. Forward every export to the real DLL. Add your payload to `DllMain`.
5. **Validate.** Drop the proxy in the app directory and launch the application. The legitimate functionality should work normally while your payload executes.

Omnispex replaces the manual work of PE-bear, Process Explorer, and Procmon with a single command. The manual tools remain valuable for forensic validation -- when you need to see the exact Procmon stack trace or verify a forwarded export's RVA -- but the discovery phase that used to take an hour per target now takes seconds.
