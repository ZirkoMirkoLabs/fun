$ErrorActionPreference = 'Stop'
try {
    $uvCommand = Get-Command uv -ErrorAction SilentlyContinue
    $uvPath = if ($uvCommand) { $uvCommand.Source } else { Join-Path $env:USERPROFILE '.local\bin\uv.exe' }
    if (-not (Test-Path -LiteralPath $uvPath)) {
        Write-Host 'Installing uv and a managed Python for PixelSnap...'
        Invoke-RestMethod 'https://astral.sh/uv/0.13.6/install.ps1' | Invoke-Expression
        $uvPath = Join-Path $env:USERPROFILE '.local\bin\uv.exe'
        if (-not (Test-Path -LiteralPath $uvPath)) { throw 'uv installation failed. Check network/proxy access to astral.sh.' }
    }
    $env:PIXELSNAP_UV = $uvPath
    & $uvPath run --no-project --python 3.12 (Join-Path $PSScriptRoot 'bootstrap.py') @args
    exit $LASTEXITCODE
} catch {
    [Console]::Error.WriteLine("PixelSnap could not start: $_")
    exit 3
}
