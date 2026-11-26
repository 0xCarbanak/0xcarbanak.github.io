# Tracing DLL loads on Windows

This walkthrough follows a DLL load from the executable’s import table to the file Windows maps into the process. I’m using portable Notepad++ as the example and `version.dll` to connect the import, export, file lookup, and image load evidence.

## 1. Tools we need

- Notepad++ portable as the example application.
- [Process Explorer](https://learn.microsoft.com/en-us/sysinternals/downloads/process-explorer) to list loaded modules and read the process environment.
- [PE-bear](https://github.com/hasherezade/pe-bear) to inspect the executable’s imports and the DLLs’ exports.
- [Process Monitor](https://learn.microsoft.com/en-us/sysinternals/downloads/procmon), or Procmon, to see file operations and image loads as they happen.
- OMNISPEX to cross-check the import and load lists after the manual walkthrough.

## 2. DLL basics

### What a DLL does

A dynamic-link library is a Windows file that can provide code, data, or resources to an application. An **export** is a function or data item the DLL makes available. An **import** is a dependency declared by an EXE or another DLL. Windows maps the library into the process so the process can use it.

### Load-time linking

At startup, Windows reads the EXE’s regular import table, maps the required DLLs, and resolves the imported functions before the EXE’s entry point runs. Those DLLs can declare imports of their own, so a startup trace can contain modules absent from the EXE’s direct import list.

### Run-time linking

A running program can request a library with `LoadLibrary` or `LoadLibraryEx` and look up an exported function with `GetProcAddress`. An app might do this when you open a feature that uses a plug-in. It can also do it during startup, so the timestamp alone can’t tell you how the request was made. A delay-loaded import is another possibility. The program declares the dependency ahead of time and resolves it when first used.

> **Three tools, three kinds of evidence.** PE-bear shows what the executable declares. Process Explorer shows what’s mapped now. Procmon records when Windows mapped a file and the path it loaded from.

[Microsoft’s DLL linking guide](https://learn.microsoft.com/en-us/windows/win32/dlls/about-dynamic-link-libraries) · [Microsoft’s guide to delay-loaded DLLs](https://learn.microsoft.com/en-us/cpp/build/reference/linker-support-for-delay-loaded-dlls)

## 3. Get the loaded DLL list

### Find the process in Process Explorer

Open Notepad++, then type `notepad` in the top-right filter in Process Explorer. Select `notepad++.exe` and note its PID. Use that PID to keep observations tied to this instance of the process.

![Process Explorer with notepad++.exe, its PID, and the filter box outlined.](/journal/dll-loads/process-selection.png)

*Select the Notepad++ row and check the PID.*

If the lower pane is hidden, enable **View > Show Lower Pane**. Click **DLLs** beside **Handles** and **Threads**. Read the **Name** and **Path** columns together to see the DLL name and the file Windows mapped.

![Process Explorer’s lower pane with the DLLs tab outlined.](/journal/dll-loads/dll-pane.png)

![The module list with Name and Path outlined.](/journal/dll-loads/loaded-module-list.png)

*The Path column shows where each loaded file came from.*

### Check the process’s PATH

In Process Explorer, double-click `notepad++.exe`, open **Environment**, and find `Path`. Compare each mapped file’s parent folder with the exact entries in that process’s `PATH`. A `System32` entry matches that directory. A DriverStore subfolder has its own path.

![Process Explorer properties with the Environment tab and the Path variable outlined.](/journal/dll-loads/process-environment.png)

*Read PATH from the process you’re inspecting.*

Here’s how the 83 DLLs in a separate startup recording grouped by parent folder:

| Observed folder | DLLs | Parent on PATH |
| --- | ---: | --- |
| System32 | 66 | Yes |
| WinSxS | 11 | No |
| DriverStore subfolders | 3 | No |
| Portable app plug-in folders | 3 | No |

> **PATH membership is context.** System32 can appear in the environment and still be reached through Windows’ system-folder check. The mapped path tells you which file loaded. The file events provide evidence about how this particular lookup progressed.

## 4. Read the imports and exports in PE-bear

### Compare the EXE’s imports with the loaded list

In Process Explorer, open the process properties, select **Image**, and copy the EXE’s path. In PE-bear, use **File > Open** and select that file. Click **Imports** and compare the regular import names with the modules recorded during startup.

![PE-bear with the Imports tab, notepad++.exe, and two names in the import list outlined.](/journal/dll-loads/pe-imports.png)

*Check the filename in PE-bear before reading its imports.*

| Startup observation | Count |
| --- | ---: |
| DLL names mapped in the Procmon recording | 83 |
| Names in the EXE’s regular import table | 19 |
| Names found in both lists | 19 |

### Read local and forwarded exports

Open the recorded System32 copies of `version.dll` and `sensapi.dll` separately in PE-bear. Click **Exports**. A local export points to code or data in the same image. A forwarded export points to a string in the export table that names a symbol in another DLL.

![PE-bear tab strip with Exports outlined.](/journal/dll-loads/pe-exports-tab.png)

![The two Function RVA values associated with the VerLanguageName entries in version.dll.](/journal/dll-loads/version-exports.png)

*The two boxed addresses in version.dll fall inside its export table range.*

![The three Function RVA values in sensapi.dll.](/journal/dll-loads/sensapi-exports.png)

*All three boxed addresses in sensapi.dll point to local code.*

`version.dll` gives us both kinds of entry in one file. `GetFileVersionInfoW` has a local address, while `VerLanguageNameA` forwards to `KERNEL32.VerLanguageNameA`. The saved PE-bear view left the **Forwarder** cells blank, so I checked the Function RVA, an address relative to the image base. In the inspected copy, `5F5C` and `5F87` fall inside `version.dll`’s export table range of `5D60` through `5FBF`. All three displayed `sensapi.dll` entries fall outside that file’s export table range of `50E0` through `5173`. Local code can still call functions in other modules. [Microsoft’s PE export address table reference](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format#export-address-table)

## 5. How Windows finds a DLL

A full path normally identifies the file for that request. When Windows receives only a DLL name, the loader resolves the name using the rules for that process. Its dependencies can still be resolved by name, even when the original request used an absolute path.

Some names resolve before a folder search. Windows can map an API set to its implementation, follow a side-by-side manifest, reuse a module already in memory, or use an operating-system copy of a Known DLL. Packaging and loader options affect which rules and folders apply.

For a standard unpackaged app, the folder search can include the executable’s folder, Windows system folders, the working directory, and the process’s `PATH`. With default settings, `PATH` comes after those other folders. The working directory can differ from the EXE’s folder. A child process normally inherits its environment from its parent. [Microsoft’s DLL search order](https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-search-order) · [Microsoft’s process environment reference](https://learn.microsoft.com/en-us/windows/win32/procthread/environment-variables)

## 6. Trace the load in Process Monitor

### Capture from before startup

Close Notepad++. In Procmon, open **Filter > Filter**, set **Include** for each rule below, and click **Add**. Enable file system and process/thread activity and leave **Drop Filtered Events** off. Start capture before opening the application. After the window appears, stop capture and check the PID for the new instance.

![Procmon’s filter dialog with the rule fields, Include action, and Add button outlined.](/journal/dll-loads/procmon-filter.png)

*Use Include and Add for each filter rule.*

| Field | Condition | Value |
| --- | --- | --- |
| Process Name | is | `notepad++.exe` |
| Path | ends with | `\version.dll` |
| Operation | is | `CreateFile` |
| Operation | is | `Load Image` |

### Read the file operations in order

The first recorded open returned `NAME NOT FOUND`. The next open succeeded on `C:\Windows\System32\version.dll`. Double-click each `CreateFile` row and read the details on the **Event** tab.

![Procmon event list with the System32 path and SUCCESS result outlined for the CreateFile row.](/journal/dll-loads/procmon-open-row.png)

*Start with the process ID, operation, path, and result in the event list.*

| Local time | Operation | Result | Path |
| --- | --- | --- | --- |
| `14:41:47.8643375` | `CreateFile` | `NAME NOT FOUND` | `C:\Example\version.dll` (illustrative) |
| `14:41:47.8655871` | `CreateFile` | `SUCCESS` | `C:\Windows\System32\version.dll` |
| `14:41:47.8671711` | `Load Image` | `SUCCESS` | `C:\Windows\System32\version.dll` |

![Procmon event details for the failed open, with Disposition Open outlined.](/journal/dll-loads/procmon-open-missing.png)

*The failed request shows `Disposition: Open`.*

![Procmon event details for the successful open, with Disposition Open and OpenResult Opened outlined.](/journal/dll-loads/procmon-open-existing.png)

*The second request shows `OpenResult: Opened`, so Windows opened the existing file to read its attributes.*

> **Look for the separate Load Image row.** `CreateFile` covers both open and create requests. `Disposition` tells you what was requested. On a successful request, `OpenResult` tells you whether Windows opened an existing file or created a new one. The image-load event shows that Windows mapped the library into the process. [Microsoft’s file open and create dispositions](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/wdm/nf-wdm-zwcreatefile)

![Procmon Load Image row outlined for the System32 copy of version.dll.](/journal/dll-loads/procmon-load-image.png)

*This row confirms which file mapped into Notepad++.*

### Read the stack for the load

Double-click the `Load Image` row in Procmon and select **Stack**. In this startup recording, the `ntdll.dll` frame shows `NtMapViewOfSection` and the lower frames show a Windows worker thread. The EXE’s regular import table is the evidence that Notepad++ declares this dependency. For a run-time load, an application or plug-in frame can provide more context about who requested it.

![Procmon Event Properties with the Stack tab outlined.](/journal/dll-loads/procmon-stack-tab.png)

![Procmon stack frames with NtMapViewOfSection and the Windows worker thread frames outlined.](/journal/dll-loads/procmon-stack.png)

*Use the stack and the import table together to explain the load.*

## 7. Cross-check with OMNISPEX

OMNISPEX saves the work of matching the two lists by hand. In its output, `both` marks a name present in the import list and in the observed loads. My OMNISPEX run reported 19 static imports and 91 debugger-observed loads. That’s a separate recording from the Procmon baseline of 83 unique DLL names.

Use the overlap to orient yourself, then refer to the PE export table and the Procmon events for the evidence behind each observation. That’s how we can explain why `version.dll` made a useful example and which file actually loaded.
