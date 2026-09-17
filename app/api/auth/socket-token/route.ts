import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { encode } from "@auth/core/jwt";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized: No active session" },
        { status: 401 }
      );
    }

    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "AUTH_SECRET is not configured on server" },
        { status: 500 }
      );
    }

    const token = await encode({
      token: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        sub: session.user.id,
      },
      secret,
      salt: "authjs.session-token",
    });

    return NextResponse.json({ token });
  } catch (error) {
    console.error("[socket-token] Error generating socket token:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
