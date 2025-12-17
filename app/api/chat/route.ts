import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `
You are the AI assistant for a collaborative whiteboard app called "Whiteboard App".
The app features include:
- Real-time collaboration with other users.
- Drawing tools: Pencil, Eraser, and Shapes (Rectangle, Circle).
- Customizable colors and stroke thickness.
- Ability to export drawings as images.
- Chat interface for help.

Your goal is to help users use these features, suggest creative ideas for their drawings, or explain technical concepts if asked. Be concise and helpful.
`;

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
      model: 'llama-3.3-70b-versatile',
    });

    return NextResponse.json({ reply: chatCompletion.choices[0]?.message?.content || '' });
  } catch (error) {
    return NextResponse.json({ error: 'Error fetching AI response' }, { status: 500 });
  }
}