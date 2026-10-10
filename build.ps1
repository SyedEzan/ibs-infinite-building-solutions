# =====================================================================
# IBS build script.
# Standardizes header, footer, floating WhatsApp and back-to-top across
# ALL public pages from the single shared source in components/.
# Idempotent: running it any number of times produces identical output.
# Reads/writes UTF-8 without BOM. No browser-side fetching required.
#
# Strategy: on every run we STRIP the injected chrome blocks and floats
# (identified by their exact class names, never the page content) and
# then re-inject fresh markup from the shared components. Because the
# strip is content-safe and complete, repeated runs converge.
# =====================================================================
$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

$pages = @(
  'index.html',
  'about.html',
  'services.html',
  'contact.html',
  'pest-control.html',
  'termite-proofing.html',
  'thermal-insulation.html',
  'waterproofing.html',
  'products/heat-reflective-coating.html'
)

$header = [System.IO.File]::ReadAllText((Join-Path $root 'components/shared-header.html'), $utf8).TrimEnd()
$footer = [System.IO.File]::ReadAllText((Join-Path $root 'components/shared-footer.html'), $utf8).TrimEnd()

# Tokens that identify an OLD inline chrome-behaviour script to retire.
$chromeTokens = 'ibs-menu-toggle|menuToggle|mainNavigation|menu-toggle|whatsappButton|backTop|ibs-footer-include|nav-item has-dropdown|nav-item\.has-dropdown|getElementById\("(navigation|services)"\)|getElementById\(''hamburger''\)|getElementById\(''mobile-menu''\)|getElementById\("menu"\)'

foreach ($pg in $pages) {
  $path = Join-Path $root $pg
  $c = [System.IO.File]::ReadAllText($path, $utf8)

  # --- Fix broken webp logo references to the valid PNG. ---
  $c = $c -replace 'ibs-logo\.webp', 'ibs-logo.png'

  # --- Retire browser-side injector scripts (footer.js / old script.js). ---
  $c = [regex]::Replace($c, '(?is)<script[^>]*src="[^"]*(?:footer\.js|script\.js)"[^>]*>\s*</script>', '')

  # --- Retire old footer chrome stylesheet link. ---
  $c = [regex]::Replace($c, '(?is)<link[^>]*footer\.css[^>]*>', '')

  # --- Retire OLD inline chrome-behaviour scripts (keep JSON-LD intact). ---
  $c = [regex]::Replace($c, '(?is)<script(?<attr>[^>]*)>(?<body>.*?)</script>', {
      param($m)
      if ($m.Groups['attr'].Value -match 'application/ld\+json') { return $m.Value }
      if ($m.Groups['body'].Value -match $chromeTokens) { return '' }
      return $m.Value
    })

  # --- Strip INJECTED shared header block(s): marker + <header class="ibs-header">...</header>. ---
  $c = [regex]::Replace($c, '(?is)<!--\s*IBS:HEADER\s*-->\s*', '')
  $c = [regex]::Replace($c, '(?is)<header\b[^>]*class="[^"]*\bibs-header\b[^"]*"[^>]*>.*?</header\s*>', '')

  # --- Strip INJECTED shared footer block(s): <footer class="ibs-footer">...</footer> + marker. ---
  $c = [regex]::Replace($c, '(?is)<footer\b[^>]*class="[^"]*\bibs-footer\b[^"]*"[^>]*>.*?</footer\s*>', '')
  $c = [regex]::Replace($c, '(?is)<!--\s*IBS:FOOTER\s*-->\s*', '')

  # --- Strip INJECTED floating controls (matched by exact ibs-* class). ---
  $c = [regex]::Replace($c, '(?is)<a\b[^>]*class="[^"]*\bibs-whatsapp\b[^"]*"[^>]*>[\s\S]*?</a>', '')
  $c = [regex]::Replace($c, '(?is)<button\b[^>]*class="[^"]*\bibs-back-top\b[^"]*"[^>]*>[\s\S]*?</button>', '')

  # --- Ensure shared chrome stylesheet + behaviour script are present exactly once. ---
  $c = [regex]::Replace($c, '(?is)[ \t]*<link[^>]*shared-blocks\.css"[^>]*>\r?\n', '')
  $c = [regex]::Replace($c, '(?is)[ \t]*<script[^>]*src="[^"]*shared-behavior\.js"[^>]*>\s*</script>\r?\n', '')

  # --- First build only: strip ORIGINAL non-shared header/footer variants + floats. ---
  if ($c -notmatch '(?is)<body') { Write-Output ("skip (no body): {0}" -f $pg); continue }

  $c = [regex]::Replace($c, '(?is)<header\b[^>]*>.*?</header\s*>', '')
  $c = [regex]::Replace($c, '(?is)<footer\b[^>]*>.*?</footer\s*>', '')
  $c = [regex]::Replace($c, '(?is)<a\b[^>]*class="[^"]*(?:wa-float|whatsapp-float)[^"]*"[^>]*>[\s\S]*?</a>', '')
  $c = [regex]::Replace($c, '(?is)<(?:a|button)\b[^>]*class="[^"]*\bback-top\b[^"]*"[^>]*>[\s\S]*?</(?:a|button)>', '')
  # Remove any stray/orphaned header & footer tags left behind.
  $c = [regex]::Replace($c, '(?is)</?\s*header\b[^>]*>', '')
  $c = [regex]::Replace($c, '(?is)</?\s*footer\b[^>]*>', '')

  # --- Normalize whitespace: collapse 3+ consecutive blank lines to one ---
  # (strip steps above can leave behind blank lines; collapsing keeps the
  #  output byte-identical across repeated runs).
  $c = [regex]::Replace($c, '(\r?\n[ \t]*)+\r?\n', "`r`n")

  # --- Inject shared header right after <body ...>. ---
  $headerBlock = "<!--IBS:HEADER-->`r`n" + $header
  $c = [regex]::Replace($c, '(?is)(<body\b[^>]*>)', { param($m) $m.Groups[1].Value + "`r`n" + $headerBlock }, 1)

  # --- Inject shared footer (with floating controls) before </body>. ---
  $footerBlock = $footer + "`r`n<!--IBS:FOOTER-->"
  $c = [regex]::Replace($c, '(?is)</body\s*>', { param($m) "  " + $footerBlock + "`r`n</body>" }, 1)

  # --- Add chrome CSS link into <head>. ---
  $cssLink = '  <link rel="stylesheet" href="/components/shared-blocks.css">'
  $c = [regex]::Replace($c, '(?is)</head\s*>', { param($m) $cssLink + "`r`n</head>" }, 1)

  # --- Add behaviour script before </body>. ---
  $beh = '  <script src="/components/shared-behavior.js" defer></script>'
  $c = [regex]::Replace($c, '(?is)</body\s*>', { param($m) $beh + "`r`n</body>" }, 1)

  [System.IO.File]::WriteAllText($path, $c, $utf8)
  Write-Output ("built: {0}" -f $pg)
}

Write-Output 'Build complete.'
