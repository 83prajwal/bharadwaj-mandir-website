param(
  [string]$AssetRoot = "public",
  [string]$ReviewRoot = "review/assets"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = (Resolve-Path $AssetRoot).Path
New-Item -ItemType Directory -Force -Path $ReviewRoot | Out-Null
$review = (Resolve-Path $ReviewRoot).Path
$files = Get-ChildItem $root -Recurse -File | Where-Object { $_.Extension -match '^\.(jpg|jpeg|png|webp|avif|gif|mp4|mov|webm)$' }
$sourceFiles = Get-ChildItem src -Recurse -File | Where-Object { $_.Extension -match '^\.(js|jsx|json|css|ts|tsx)$' }
$sourceText = ($sourceFiles | ForEach-Object { Get-Content $_.FullName -Raw }) -join "`n"
$inventory = foreach ($file in $files) {
  $relative = '/' + ($file.FullName.Substring($root.Length).TrimStart('\') -replace '\\','/')
  $isVideo = $file.Extension -match '^\.(mp4|mov|webm)$'
  $width = $null; $height = $null; $ratio = $null; $subject = 'Needs Review'; $confidence = 'Low'; $usage = 'Review before website use'
  if (-not $isVideo) {
    try {
      $image = [System.Drawing.Image]::FromFile($file.FullName)
      $width = $image.Width; $height = $image.Height; $ratio = [math]::Round($width / $height, 3)
      $image.Dispose()
    } catch {
      if ($file.Extension -match '^\.webp$') {
        $probe = Get-Command ffprobe -ErrorAction SilentlyContinue
        if ($probe) {
          $dimensions = & $probe.Source -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 $file.FullName 2>$null
          if ($dimensions -match '^(\d+)x(\d+)$') { $width=[int]$Matches[1]; $height=[int]$Matches[2]; $ratio=[math]::Round($width / $height, 3) }
          else { $subject = 'Unreadable WebP image'; $confidence = 'High' }
        }
      } else { $subject = 'Unreadable image'; $confidence = 'High' }
    }
    if ($relative -match '/assets/optimized/') { $subject = 'Optimized web derivative; inspect source image for subject'; $confidence = 'High'; $usage = 'Website variant; see source mapping' }
    elseif ($relative -match '/images/finished/') { $subject = 'Mandir/product photograph; completion or installation status not independently confirmed'; $confidence = 'Medium'; $usage = 'Mandir design gallery candidate; visually inspect' }
    elseif ($relative -match '/images/workshop/') { $subject = 'Mandir, product, or workshop photograph; see contact sheet'; $confidence = 'Medium'; $usage = 'Product/workshop gallery candidate; visually inspect' }
    elseif ($relative -match '/images/designs/') { $subject = 'Carving, design detail, concept, or drawing; see contact sheet'; $confidence = 'Medium'; $usage = 'Details or design references; distinguish photos from drawings' }
  } else { $subject = 'Video; content inspection pending'; $confidence = 'Low'; $usage = 'Workshop video candidate; inspect visually' }
  $references = @($sourceFiles | Where-Object { (Get-Content $_.FullName -Raw) -match [regex]::Escape($file.Name) } | ForEach-Object { $_.FullName.Substring((Get-Location).Path.Length + 1) }) -join '; '
  [pscustomobject]@{
    OriginalFilename=$file.Name; CurrentPath=$relative; Extension=$file.Extension.ToLower(); Type=$(if($isVideo){'video'}else{'image'});
    SizeBytes=$file.Length; Width=$width; Height=$height; AspectRatio=$ratio; LikelySubject=$subject; ClassificationConfidence=$confidence;
    ExactDuplicateGroup=''; ExistingReferences=$references; RecommendedDestination=$relative; RecommendedUsage=$usage;
    Optimization=$(if($relative -match '/assets/optimized/'){ 'Already WebP optimized derivative; source retained separately' } elseif($file.Extension -match '^\.(mp4|mov|webm)$'){ 'Video; defer playback and retain poster' } elseif($file.Length -ge 500000){ 'Candidate for resized WebP variants; see optimization report' } else { 'Small source image; use original unless page-specific sizing is needed' }); SHA256=(Get-FileHash $file.FullName -Algorithm SHA256).Hash
  }
}
$hashGroups = $inventory | Group-Object SHA256 | Where-Object Count -gt 1
foreach ($group in $hashGroups) { foreach ($item in $group.Group) { $item.ExactDuplicateGroup = ($group.Name.Substring(0,12)) } }
$inventory | Select-Object * -ExcludeProperty SHA256 | Export-Csv (Join-Path $review 'asset-inventory.csv') -NoTypeInformation -Encoding utf8
$inventory | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $review 'asset-manifest.json') -Encoding utf8
$dupes = foreach ($group in $hashGroups) { foreach($item in $group.Group){ [pscustomobject]@{Hash=$group.Name;Path=$item.CurrentPath;Bytes=$item.SizeBytes} } }
$dupes | Export-Csv (Join-Path $review 'duplicate-candidates.csv') -NoTypeInformation -Encoding utf8

# Contact sheets are grouped by the existing source folders and stay outside public assets.
$photos = $files | Where-Object { $_.Extension -notmatch '^\.(mp4|mov|webm)$' }
foreach ($folderGroup in ($photos | Group-Object { $_.Directory.FullName.Substring($root.Length).TrimStart('\') -replace '[\\/]','-' })) {
  $items = @($folderGroup.Group | Sort-Object Name)
  for ($start=0; $start -lt $items.Count; $start += 24) {
    $batch = @($items | Select-Object -Skip $start -First 24)
    $sheet = New-Object System.Drawing.Bitmap(1200, 1050)
    $graphics = [System.Drawing.Graphics]::FromImage($sheet)
    $graphics.Clear([System.Drawing.Color]::FromArgb(248,246,241))
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $font = New-Object System.Drawing.Font('Arial', 10, [System.Drawing.FontStyle]::Regular)
    for ($i=0; $i -lt $batch.Count; $i++) {
      $col = $i % 4; $row = [math]::Floor($i / 4); $x=($col*300)+10; $y=($row*175)+8
      $img=$null
      try {
        $img=[System.Drawing.Image]::FromFile($batch[$i].FullName)
        $scale=[math]::Min(270/$img.Width, 135/$img.Height); $w=[int]($img.Width*$scale); $h=[int]($img.Height*$scale)
        $graphics.DrawImage($img, [int]($x+(270-$w)/2), [int]($y+(135-$h)/2), $w, $h)
      } catch { }
      if ($img) { $img.Dispose() }
      $caption = $batch[$i].Name
      if ($caption.Length -gt 43) { $caption = $caption.Substring(0,40) + '...' }
      $graphics.DrawString($caption, $font, [System.Drawing.Brushes]::Black, [float]$x, [float]($y+138)) | Out-Null
    }
    $sheetIndex=[int]($start/24)+1
    $out=Join-Path $review ("contact-sheet-{0}-{1:D2}.jpg" -f $folderGroup.Name,$sheetIndex)
    $sheet.Save($out,[System.Drawing.Imaging.ImageFormat]::Jpeg)
    $font.Dispose(); $graphics.Dispose(); $sheet.Dispose()
  }
}
"Assets: $($files.Count); images: $($photos.Count); videos: $(($files | Where-Object {$_.Extension -match '^\.(mp4|mov|webm)$'}).Count); exact duplicate files: $(($dupes | Measure-Object).Count); inventory: $(Join-Path $review 'asset-inventory.csv')"
