import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const { role, text } = await req.json();
    const filePath = path.join(process.cwd(), "conversations_log.txt");
    
    // Format : [03/01/2026 20:30:15] UTILISATEUR : Bonjour
    const timestamp = new Date().toLocaleString("fr-FR", { 
      dateStyle: "short", 
      timeStyle: "medium" 
    });
    
    const logEntry = `[${timestamp}] ${role.toUpperCase()} : ${text}\n`;
    
    fs.appendFileSync(filePath, logEntry, "utf8");
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Log error" }, { status: 500 });
  }
}
