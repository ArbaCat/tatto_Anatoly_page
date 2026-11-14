# Local preview of the site on Windows, with nothing to install: serves the repository folder at
# http://localhost:8765/ (the same address as `python3 -m http.server 8765` on macOS / Linux).
# Started by the "site-windows" entry in .claude/launch.json, or by hand:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preview.ps1
# Only this computer can open the address. Stop with Ctrl+C.
param([int]$Port = 8765)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\', '/')

$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.png'  = 'image/png'
  '.webp' = 'image/webp'
  '.avif' = 'image/avif'
  '.gif'  = 'image/gif'
  '.ico'  = 'image/x-icon'
  '.woff2' = 'font/woff2'
  '.woff' = 'font/woff'
  '.txt'  = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
  $listener.Start()
} catch {
  Write-Host "Could not start on port $Port. Is the preview already running? $($_.Exception.Message)"
  exit 1
}
Write-Host "Serving $root at http://localhost:$Port/ (Ctrl+C to stop)"

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $response = $context.Response
    try {
      $relative = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
      if ($relative -eq '' -or $relative.EndsWith('/')) { $relative += 'index.html' }
      $path = [IO.Path]::GetFullPath((Join-Path $root $relative))

      # Only files inside the site folder, and nothing hidden (.git, .claude, .github).
      $inside = $path.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
      $hidden = @($relative -split '[\\/]' | Where-Object { $_.StartsWith('.') }).Count -gt 0

      if ($inside -and -not $hidden -and (Test-Path -LiteralPath $path -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($path)
        $extension = [IO.Path]::GetExtension($path).ToLowerInvariant()
        if ($types.ContainsKey($extension)) { $response.ContentType = $types[$extension] }
        else { $response.ContentType = 'application/octet-stream' }
        # Never cached, so a reload always shows the latest edit.
        $response.Headers['Cache-Control'] = 'no-store'
        $response.ContentLength64 = $bytes.Length
        if ($context.Request.HttpMethod -ne 'HEAD') { $response.OutputStream.Write($bytes, 0, $bytes.Length) }
      } else {
        $response.StatusCode = 404
      }
    } catch {
      try { $response.StatusCode = 500 } catch {}
    } finally {
      try { $response.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
}
