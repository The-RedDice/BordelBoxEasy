param(
    [string]$ImagePath = 'C:\Users\Maxence\.gemini\antigravity-ide\brain\05c413cd-e103-47b0-b436-87b1186e6f36\bordelbox_icon_1790073346409.jpg'
)

Add-Type -AssemblyName System.Drawing
$iconDir = Join-Path $PSScriptRoot '..\src-tauri\icons'
if (-not (Test-Path $iconDir)) {
    New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
}

$img = [System.Drawing.Image]::FromFile($ImagePath)

function Export-ResizedPng($width, $height, $outFile) {
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $width, $height)
    $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

Export-ResizedPng 32 32 (Join-Path $iconDir '32x32.png')
Export-ResizedPng 128 128 (Join-Path $iconDir '128x128.png')
Export-ResizedPng 256 256 (Join-Path $iconDir '128x128@2x.png')

# Create icon.ico
$bmpIco = New-Object System.Drawing.Bitmap(256, 256)
$gIco = [System.Drawing.Graphics]::FromImage($bmpIco)
$gIco.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gIco.DrawImage($img, 0, 0, 256, 256)
$hIcon = $bmpIco.GetHicon()
$ico = [System.Drawing.Icon]::FromHandle($hIcon)
$icoPath = Join-Path $iconDir 'icon.ico'
$fs = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
$ico.Save($fs)
$fs.Close()
$ico.Dispose()
$gIco.Dispose()
$bmpIco.Dispose()

# icon.icns (copy 256 png for fallback)
Copy-Item (Join-Path $iconDir '128x128@2x.png') (Join-Path $iconDir 'icon.icns')

$img.Dispose()
Write-Host "Icons successfully generated in $iconDir"
Get-ChildItem $iconDir | Select-Object Name, Length
