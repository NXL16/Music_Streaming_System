import { NextRequest, NextResponse } from "next/server";

const ARTWORK_HOST = "r2.404hz.me";

export async function GET(request: NextRequest) {
  const requestedUrl = request.nextUrl.searchParams.get("url");
  if (!requestedUrl) {
    return NextResponse.json({ error: "Missing artwork URL." }, { status: 400 });
  }

  let artworkUrl: URL;
  try {
    artworkUrl = new URL(requestedUrl);
  } catch {
    return NextResponse.json({ error: "Invalid artwork URL." }, { status: 400 });
  }

  if (artworkUrl.protocol !== "https:" || artworkUrl.hostname !== ARTWORK_HOST) {
    return NextResponse.json({ error: "Artwork host is not allowed." }, { status: 400 });
  }

  try {
    const upstream = await fetch(artworkUrl, {
      next: { revalidate: 3600 },
      redirect: "error",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Artwork could not be loaded." },
        { status: upstream.status },
      );
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Artwork is not an image." }, { status: 415 });
    }

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Artwork service is unavailable." },
      { status: 502 },
    );
  }
}
