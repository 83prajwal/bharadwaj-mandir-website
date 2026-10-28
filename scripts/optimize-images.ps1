param(
  [string]$AssetRoot = 'public/images',
  [string]$OutputRoot = 'public/assets/optimized',
  [string]$ReportRoot = 'review/assets',
  [int]$ThresholdBytes = 500000,
  [int]$MaxDimension = 2000,
  [int]$Quality = 84,
  [string]$Ffmpeg = 'C:\ffmpeg-8.0.1-essentials_build\bin\ffmpeg.exe'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Ffmpeg)) { $found = Get-Command ffmpeg -ErrorAction SilentlyContinue; if ($found) { $Ffmpeg = $found.Source } else { throw 'ffmpeg was not found. Install ffmpeg or pass -Ffmpeg with its executable path.' } }
$root = (Resolve-Path $AssetRoot).Path
New-Item -ItemType Directory -Force -Path $OutputRoot,$ReportRoot | Out-Null
$outRoot = (Resolve-Path $OutputRoot).Path
$rows = foreach ($file in (Get-ChildItem $root -Recurse -File | Where-Object { $_.Extension -match '^\.(jpg|jpeg|png)$' -and $_.Length -ge $ThresholdBytes })) {
  $relative = $file.FullName.Substring($root.Length).TrimStart('\')
  $relativeFolder = Split-Path $relative -Parent
  $stem = [System.IO.Path]::GetFileNameWithoutExtension($file.Name) -replace '[^a-zA-Z0-9-]+','-'
  $targetFolder = Join-Path $outRoot $relativeFolder
  New-Item -ItemType Directory -Force -Path $targetFolder | Out-Null
  $thumbnail = Join-Path $targetFolder ($stem.ToLower() + '-w900.webp')
  $display = Join-Path $targetFolder ($stem.ToLower() + '-w2000.webp')
  foreach ($variant in @(@{Width=900;Path=$thumbnail},@{Width=$MaxDimension;Path=$display})) {
    & $Ffmpeg -hide_banner -loglevel error -y -i $file.FullName -vf "scale=$($variant.Width):$($variant.Width):force_original_aspect_ratio=decrease" -c:v libwebp -quality $Quality -method 6 -an $variant.Path
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $variant.Path)) { throw "Image conversion failed for $($file.FullName)" }
  }
  $optimizedBytes = (Get-Item $thumbnail).Length + (Get-Item $display).Length
  $useOptimized = (Get-Item $display).Length -lt ($file.Length * 0.9)
  if (-not $useOptimized) { Remove-Item -LiteralPath $thumbnail,$display }
  [pscustomobject]@{
    OriginalPath=('/images/' + $relative.Replace('\','/')); OriginalFilename=$file.Name; OriginalBytes=$file.Length;
    ThumbnailPath=$(if($useOptimized){'/assets/optimized/' + $relativeFolder.Replace('\','/') + '/' + $stem.ToLower() + '-w900.webp'}else{''});
    DisplayPath=$(if($useOptimized){'/assets/optimized/' + $relativeFolder.Replace('\','/') + '/' + $stem.ToLower() + '-w2000.webp'}else{''});
    OptimizedBytes=$(if($useOptimized){$optimizedBytes}else{$null}); SavingsBytes=$(if($useOptimized){$file.Length-(Get-Item $thumbnail).Length-(Get-Item $display).Length}else{0});
    SavingsPercent=$(if($useOptimized){[math]::Round(100*($file.Length-(Get-Item $thumbnail).Length-(Get-Item $display).Length)/$file.Length,1)}else{0});
    MaxDimension=$MaxDimension; Quality=$Quality; UseOptimized=$useOptimized
  }
}
$rows | Export-Csv (Join-Path $ReportRoot 'optimization-report.csv') -NoTypeInformation -Encoding utf8
"Candidates: $($rows.Count); optimized variants retained: $(($rows | Where-Object UseOptimized).Count); original bytes: $(($rows | Measure-Object OriginalBytes -Sum).Sum); optimized bytes: $(($rows | Measure-Object OptimizedBytes -Sum).Sum); report: $(Join-Path $ReportRoot 'optimization-report.csv')"
