

// middleware.ts
// Vercel Edge Middleware — serves OG previews to social media bots
// for /public/register/:token and /public/student-register/:token.
// Everyone else hits your normal Angular app.

import { NextRequest, NextResponse } from 'next/server';

export const config = {
  matcher: ['/public/register/:token*', '/public/student-register/:token*'],
};

const SUPABASE_URL = process.env['SUPABASE_URL'] || '';
const SUPABASE_ANON_KEY = process.env['SUPABASE_ANON_KEY'] || '';
const APP_ORIGIN = process.env['APP_ORIGIN'] || 'https://web.churchmann.org';

const BOT_PATTERNS = [
  /facebookexternalhit/i,
  /facebot/i,
  /twitterbot/i,
  /linkedinbot/i,
  /slackbot/i,
  /discordbot/i,
  /telegrambot/i,
  /whatsapp/i,
  /skypeuripreview/i,
  /pinterest/i,
  /redditbot/i,
  /applebot/i,
  /vkshare/i,
  /googlebot/i,
];

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return BOT_PATTERNS.some((re) => re.test(userAgent));
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Context {
  churchName: string;
  churchLogo: string;
  linkType: 'member' | 'student';
}

async function lookupContext(
  linkType: 'member' | 'student',
  token: string,
): Promise<Context | null> {
  const table =
    linkType === 'student'
      ? 'student_registration_links'
      : 'registration_links';

  const linkResp = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?link_token=eq.${encodeURIComponent(
      token,
    )}&select=church_id&limit=1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    },
  );

  if (!linkResp.ok) return null;
  const linkRows = (await linkResp.json()) as Array<{ church_id: string }>;
  if (!linkRows || linkRows.length === 0) return null;
  const churchId = linkRows[0].church_id;

  const churchResp = await fetch(
    `${SUPABASE_URL}/rest/v1/churches?id=eq.${churchId}&select=name,logo_url&limit=1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    },
  );

  if (!churchResp.ok) return null;
  const churchRows = (await churchResp.json()) as Array<{
    name: string | null;
    logo_url: string | null;
  }>;
  if (!churchRows || churchRows.length === 0) return null;

  return {
    churchName: churchRows[0].name || 'Registration',
    churchLogo:
      churchRows[0].logo_url || `${APP_ORIGIN}/assets/images/og-invite.png`,
    linkType,
  };
}

function buildOgHtml(opts: {
  churchName: string;
  churchLogo: string;
  linkType: 'member' | 'student';
  fullUrl: string;
}): string {
  const isStudent = opts.linkType === 'student';
  const safeName = escapeHtml(opts.churchName);
  const safeLogo = escapeHtml(opts.churchLogo);
  const safeUrl = escapeHtml(opts.fullUrl);

  const title = isStudent
    ? `Enrol your child — ${safeName}`
    : `Register — ${safeName}`;

  const description = isStudent
    ? `${safeName} invites you to enrol your child. Tap to fill the registration form.`
    : `You've been invited to register with ${safeName}. Tap to complete the form.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${description}">

<meta property="og:type" content="website">
<meta property="og:url" content="${safeUrl}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${safeLogo}">
<meta property="og:site_name" content="${safeName}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${safeLogo}">

<meta http-equiv="refresh" content="0; url=${safeUrl}">
</head>
<body>
<p>Redirecting to <a href="${safeUrl}">${safeName} registration</a>…</p>
</body>
</html>`;
}

export async function middleware(request: NextRequest) {
  const userAgent = request.headers.get('user-agent');
  const url = new URL(request.url);

  // Only intercept for bots — humans pass through to Angular
  if (!isBot(userAgent)) {
    return NextResponse.next();
  }

  const memberMatch = url.pathname.match(/^\/public\/register\/([^/]+)\/?$/);
  const studentMatch = url.pathname.match(
    /^\/public\/student-register\/([^/]+)\/?$/,
  );
  const match = memberMatch || studentMatch;

  if (!match) {
    return NextResponse.next();
  }

  const linkType: 'member' | 'student' = studentMatch ? 'student' : 'member';
  const token = match[1];

  try {
    const context = await lookupContext(linkType, token);

    const html = buildOgHtml({
      churchName: context?.churchName || 'Registration',
      churchLogo:
        context?.churchLogo || `${APP_ORIGIN}/assets/images/og-invite.png`,
      linkType,
      fullUrl: request.url,
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        'content-type': 'text/html;charset=UTF-8',
        'cache-control': 'public, max-age=600',
      },
    });
  } catch {
    // On any error, fall through to Angular
    return NextResponse.next();
  }
}
