<?xml version="1.0" encoding="UTF-8"?>
<!-- Makes /sitemap.xml readable in a browser. Crawlers ignore this file. -->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" encoding="UTF-8" indent="yes" doctype-system="about:legacy-compat"/>

  <!-- Every URL starts with the site origin; the path after it decides the group. -->
  <xsl:variable name="first" select="//s:url[1]/s:loc"/>
  <xsl:variable name="origin" select="concat(substring-before($first, '//'), '//', substring-before(concat(substring-after($first, '//'), '/'), '/'))"/>

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="robots" content="noindex"/>
        <title>Sitemap · Chipperly</title>
        <link rel="icon" href="/brand/mark.svg" type="image/svg+xml"/>
        <style>
          @font-face { font-family: 'Alegreya'; src: url('/fonts/alegreya-latin.woff2') format('woff2'); font-weight: 400 900; font-display: swap; }
          @font-face { font-family: 'Alegreya Sans'; src: url('/fonts/alegreya-sans-400-latin.woff2') format('woff2'); font-weight: 400; font-display: swap; }
          @font-face { font-family: 'Alegreya Sans'; src: url('/fonts/alegreya-sans-700-latin.woff2') format('woff2'); font-weight: 700; font-display: swap; }
          :root { --ink: #22302f; --muted: #56615f; --bg: #faf8f5; --surface: #fff; --sand: #f2ede5; --line: #e3dccf; --teal: #1f6f78; --teal-soft: #e4f1ef; }
          * { box-sizing: border-box; }
          body { margin: 0; background: var(--bg); color: var(--ink); font: 400 1.05rem/1.55 'Alegreya Sans', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
          a { color: var(--teal); text-underline-offset: 3px; }
          .wrap { width: min(100% - 32px, 960px); margin: 0 auto; }
          header { border-bottom: 1px solid var(--line); background: var(--surface); }
          .bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 68px; }
          .brand { display: inline-flex; align-items: center; gap: 10px; font: 800 1.5rem 'Alegreya', Georgia, serif; color: var(--ink); text-decoration: none; }
          .brand img { width: 32px; height: 32px; }
          .back { font-weight: 700; text-decoration: none; }
          .hero { padding: 48px 0 28px; }
          .eyebrow { font-weight: 700; font-size: 0.82rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--teal); margin: 0 0 10px; }
          h1 { font: 800 clamp(2.1rem, 1.5rem + 2.6vw, 3rem)/1.1 'Alegreya', Georgia, serif; margin: 0; }
          .lede { color: var(--muted); max-width: 40em; margin: 14px 0 0; }
          .stats { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; padding: 0; list-style: none; }
          .stats li { background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 6px 14px; font-size: 0.95rem; }
          .stats b { color: var(--teal); }
          section { margin: 0 0 28px; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; overflow: hidden; }
          h2 { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0; padding: 18px 22px; font: 700 1.35rem 'Alegreya', Georgia, serif; background: var(--sand); border-bottom: 1px solid var(--line); }
          h2 span { font: 700 0.85rem 'Alegreya Sans', sans-serif; color: var(--muted); }
          ol { list-style: none; margin: 0; padding: 0; }
          li.row { display: grid; grid-template-columns: 1fr auto; gap: 4px 20px; align-items: center; padding: 14px 22px; border-top: 1px solid var(--line); }
          li.row:first-child { border-top: 0; }
          li.row:hover { background: #fbfaf7; }
          .title { font-weight: 700; color: var(--ink); text-decoration: none; }
          .title:hover { color: var(--teal); text-decoration: underline; }
          .path { display: block; font-size: 0.88rem; color: var(--muted); overflow-wrap: anywhere; }
          .meta { text-align: right; font-size: 0.88rem; color: var(--muted); white-space: nowrap; }
          .pill { display: inline-block; margin-left: 8px; padding: 1px 9px; border-radius: 999px; background: var(--teal-soft); color: var(--teal); font-weight: 700; font-size: 0.78rem; }
          footer { padding: 8px 0 56px; color: var(--muted); font-size: 0.92rem; }
          @media (max-width: 560px) { li.row { grid-template-columns: 1fr; } .meta { text-align: left; } }
        </style>
      </head>
      <body>
        <header>
          <div class="wrap bar">
            <a class="brand" href="/"><img src="/brand/mark.svg" alt=""/>Chipperly</a>
            <a class="back" href="/">Back to the site</a>
          </div>
        </header>
        <main class="wrap">
          <div class="hero">
            <p class="eyebrow">Sitemap</p>
            <h1>Every page on Chipperly</h1>
            <p class="lede">This is the list search engines use to find the site. It updates by itself whenever a page or post is published.</p>
            <ul class="stats">
              <li><b><xsl:value-of select="count(//s:url)"/></b> pages in total</li>
              <li><b><xsl:value-of select="count(//s:url[contains(s:loc, '/blog/') and not(contains(s:loc, '/blog/category/'))])"/></b> blog posts</li>
              <li><b><xsl:value-of select="count(//s:url[contains(s:loc, '/blog/category/')])"/></b> categories</li>
            </ul>
          </div>

          <xsl:call-template name="group">
            <xsl:with-param name="title">Main pages</xsl:with-param>
            <xsl:with-param name="urls" select="//s:url[s:loc = concat($origin, '/') or s:loc = concat($origin, '/features') or s:loc = concat($origin, '/about') or s:loc = concat($origin, '/blog')]"/>
          </xsl:call-template>
          <xsl:call-template name="group">
            <xsl:with-param name="title">Blog posts</xsl:with-param>
            <xsl:with-param name="urls" select="//s:url[contains(s:loc, '/blog/') and not(contains(s:loc, '/blog/category/'))]"/>
          </xsl:call-template>
          <xsl:call-template name="group">
            <xsl:with-param name="title">Blog categories</xsl:with-param>
            <xsl:with-param name="urls" select="//s:url[contains(s:loc, '/blog/category/')]"/>
          </xsl:call-template>
          <xsl:call-template name="group">
            <xsl:with-param name="title">Other pages</xsl:with-param>
            <xsl:with-param name="urls" select="//s:url[not(contains(s:loc, '/blog')) and not(s:loc = concat($origin, '/') or s:loc = concat($origin, '/features') or s:loc = concat($origin, '/about'))]"/>
          </xsl:call-template>
        </main>
        <footer class="wrap">
          Machine-readable version: this same address (<a href="/sitemap.xml">/sitemap.xml</a>). Also available:
          <a href="/blog/rss.xml">RSS feed</a> · <a href="/llms.txt">llms.txt</a> · <a href="/llms-full.txt">llms-full.txt</a>
        </footer>
      </body>
    </html>
  </xsl:template>

  <xsl:template name="group">
    <xsl:param name="title"/>
    <xsl:param name="urls"/>
    <xsl:if test="count($urls) &gt; 0">
      <section>
        <h2><xsl:value-of select="$title"/> <span><xsl:value-of select="count($urls)"/></span></h2>
        <ol>
          <xsl:for-each select="$urls">
            <xsl:variable name="path" select="substring-after(s:loc, $origin)"/>
            <li class="row">
              <div>
                <a class="title" href="{s:loc}">
                  <xsl:choose>
                    <xsl:when test="comment()"><xsl:value-of select="normalize-space(comment()[1])"/></xsl:when>
                    <xsl:otherwise><xsl:call-template name="label"><xsl:with-param name="path" select="$path"/></xsl:call-template></xsl:otherwise>
                  </xsl:choose>
                </a>
                <span class="path"><xsl:value-of select="$path"/></span>
              </div>
              <div class="meta">
                <xsl:choose>
                  <xsl:when test="s:lastmod">Updated <xsl:call-template name="date"><xsl:with-param name="d" select="s:lastmod"/></xsl:call-template></xsl:when>
                  <xsl:otherwise>Always current</xsl:otherwise>
                </xsl:choose>
                <xsl:if test="s:priority &gt;= 0.8"><span class="pill">Key page</span></xsl:if>
              </div>
            </li>
          </xsl:for-each>
        </ol>
      </section>
    </xsl:if>
  </xsl:template>

  <!-- "/blog/what-is-a-visual-schedule" becomes "What is a visual schedule". -->
  <xsl:template name="label">
    <xsl:param name="path"/>
    <xsl:variable name="slug">
      <xsl:call-template name="last-segment"><xsl:with-param name="s" select="$path"/></xsl:call-template>
    </xsl:variable>
    <xsl:choose>
      <xsl:when test="$path = '/' or $path = ''">Home</xsl:when>
      <xsl:otherwise>
        <xsl:variable name="words" select="translate($slug, '-', ' ')"/>
        <xsl:value-of select="concat(translate(substring($words, 1, 1), 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), substring($words, 2))"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>

  <!-- "2026-09-25" becomes "Sep 25, 2026". -->
  <xsl:template name="date">
    <xsl:param name="d"/>
    <xsl:variable name="m" select="number(substring($d, 6, 2))"/>
    <xsl:value-of select="concat(substring('JanFebMarAprMayJunJulAugSepOctNovDec', ($m - 1) * 3 + 1, 3), ' ', number(substring($d, 9, 2)), ', ', substring($d, 1, 4))"/>
  </xsl:template>

  <xsl:template name="last-segment">
    <xsl:param name="s"/>
    <xsl:choose>
      <xsl:when test="contains($s, '/')"><xsl:call-template name="last-segment"><xsl:with-param name="s" select="substring-after($s, '/')"/></xsl:call-template></xsl:when>
      <xsl:otherwise><xsl:value-of select="$s"/></xsl:otherwise>
    </xsl:choose>
  </xsl:template>
</xsl:stylesheet>
