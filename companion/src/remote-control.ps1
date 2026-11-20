# Turns on Remote Control for every session listed in the Claude desktop app's sidebar.
#
# It works through the app's accessibility interface (Windows UI Automation), as a person would:
# opens each session that has no "Remote Control" label in the sidebar, flips the Remote Control
# switch in its session rail to on, then goes back to the session that was open. It only ever turns
# switches on. With -DryRun it lists what it would do and changes nothing.
#
# Prints one line of JSON: { ok, changed: [titles], already: n, skipped: [{ title, why }], error }.
# Relies on the app's labels (English), so a redesign of the app can stop it from finding things.
param([switch]$DryRun, [int]$WaitMs = 4000)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]
$True_ = [System.Windows.Automation.Condition]::TrueCondition
$result = [ordered]@{ ok = $false; changed = @(); already = 0; skipped = @(); error = $null; dryRun = [bool]$DryRun }

function Out-Result { $result | ConvertTo-Json -Compress -Depth 4; exit 0 }

function Find-ClaudeWindow {
  foreach ($w in $A::RootElement.FindAll($Scope::Children, $True_)) {
    try { if ((Get-Process -Id $w.Current.ProcessId).ProcessName -eq 'claude' -and $w.Current.Name -eq 'Claude') { return $w } } catch {}
  }
  return $null
}

# Chromium builds its accessibility tree only once something asks for it, so the first look at the
# window can be nearly empty. Waits until the sidebar's session buttons are there.
function Get-All($win, [scriptblock]$ready) {
  $deadline = (Get-Date).AddMilliseconds($WaitMs)
  do {
    $all = @($win.FindAll($Scope::Descendants, $True_))
    if (& $ready $all) { return $all }
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $deadline)
  return $all
}

function Buttons($all) { $all | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button } }
function Invoke-El($el) { $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() }

# The open session's title, from its title bar button ("<title>, rename session").
function Current-Title($all) {
  $b = Buttons $all | Where-Object { $_.Current.Name -like '*, rename session' } | Select-Object -First 1
  if ($b) { return $b.Current.Name.Substring(0, $b.Current.Name.Length - ', rename session'.Length) }
  return $null
}

# The sessions in the sidebar: each has a "More options for <title>" button next to its own button,
# whose name starts with the title (then "Running", "Cloud", "Remote Control · Connected" and so on).
function Sessions($all) {
  $btns = @(Buttons $all)
  # The sidebar's column: session buttons start where its "New" and "Search" buttons do. (The title
  # bar and the session rail have "More options for …" buttons too, for the open session and its branch.)
  $new = $btns | Where-Object { $_.Current.Name -eq 'New' } | Select-Object -First 1
  $left = if ($new) { $new.Current.BoundingRectangle.X } else { 0 }
  $list = @()
  foreach ($more in $btns) {
    $n = $more.Current.Name
    if (-not $n.StartsWith('More options for ')) { continue }
    $title = $n.Substring('More options for '.Length)
    $item = $btns | Where-Object { $_.Current.Name -ne $n -and $_.Current.Name.StartsWith($title) -and $_.Current.Name -notlike '*, rename session' -and -not $_.Current.Name.StartsWith('More options') -and [math]::Abs($_.Current.BoundingRectangle.X - $left) -le 40 } | Select-Object -First 1
    if (-not $item) { continue }
    if ($list | Where-Object { $_.title -eq $title }) { continue }
    $list += [pscustomobject]@{ title = $title; item = $item; on = $item.Current.Name -match 'Remote Control · '; cloud = $item.Current.Name -match ' Cloud$' }
  }
  return $list
}

# Whether the open session is this one. Long titles are cut short with "..." in the sidebar.
function Is-Open($all, $title) {
  $cur = Current-Title $all
  if (-not $cur) { return $false }
  $short = $title -replace '(\.\.\.|…)$', ''
  return $cur -eq $title -or ($short -ne $title -and $cur.StartsWith($short))
}

function Rail-Switch($all) {
  foreach ($e in $all) {
    if ($e.Current.Name -ne 'Remote Control') { continue }
    try { return $e.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern) } catch {}
  }
  return $null
}

try {
  $win = Find-ClaudeWindow
  if (-not $win) { $result.error = 'The Claude app isn''t open.'; Out-Result }
  $all = Get-All $win { param($x) @($x | Where-Object { $_.Current.Name -like 'More options for *' }).Count -gt 0 }
  $sessions = @(Sessions $all)
  if (-not $sessions.Count) { $result.error = 'No sessions found in the Claude app''s sidebar. Is the sidebar open?'; Out-Result }
  $start = Current-Title $all
  $result.already = @($sessions | Where-Object { $_.on }).Count
  $todo = @($sessions | Where-Object { -not $_.on })
  foreach ($s in @($todo | Where-Object { $_.cloud })) { $result.skipped += @{ title = $s.title; why = 'cloud session' } }
  $todo = @($todo | Where-Object { -not $_.cloud })
  if ($DryRun) { $result.changed = @($todo | ForEach-Object { $_.title }); $result.ok = $true; Out-Result }

  $railOpened = $false
  foreach ($s in $todo) {
    try {
      Invoke-El $s.item
      $all = Get-All $win { param($x) Is-Open $x $s.title }
      if (-not (Is-Open $all $s.title)) { $result.skipped += @{ title = $s.title; why = 'didn''t open' }; continue }
      $sw = Rail-Switch (Get-All $win { param($x) [bool](Rail-Switch $x) })
      if (-not $sw -and -not $railOpened) {
        # The switch lives in the session rail; open the rail once (and close it again at the end).
        $rail = Buttons $all | Where-Object { $_.Current.Name -eq 'Session rail' } | Select-Object -First 1
        if ($rail) { Invoke-El $rail; $railOpened = $true; $sw = Rail-Switch (Get-All $win { param($x) [bool](Rail-Switch $x) }) }
      }
      if (-not $sw) { $result.skipped += @{ title = $s.title; why = 'no Remote Control switch' }; continue }
      if ($sw.Current.ToggleState -eq [System.Windows.Automation.ToggleState]::On) { $result.already++; continue }
      $sw.Toggle()
      Start-Sleep -Milliseconds 300
      if ($sw.Current.ToggleState -eq [System.Windows.Automation.ToggleState]::On) { $result.changed += $s.title }
      else { $result.skipped += @{ title = $s.title; why = 'switch didn''t turn on' } }
    } catch { $result.skipped += @{ title = $s.title; why = $_.Exception.Message } }
  }

  # Back to where you were.
  $all = @($win.FindAll($Scope::Descendants, $True_))
  if ($railOpened) { $rail = Buttons $all | Where-Object { $_.Current.Name -eq 'Session rail' } | Select-Object -First 1; if ($rail) { Invoke-El $rail } }
  if ($start) {
    $back = Sessions $all | Where-Object { $_.title -eq $start -or (($_.title -replace '(\.\.\.|…)$', '') -ne $_.title -and $start.StartsWith(($_.title -replace '(\.\.\.|…)$', ''))) } | Select-Object -First 1
    if ($back) { Invoke-El $back.item }
  }
  $result.ok = $true
} catch { $result.error = $_.Exception.Message }
Out-Result
