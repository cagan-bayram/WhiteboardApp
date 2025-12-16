import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a helpful assistant for a collaborative whiteboard app.' },
        { role: 'user', content: message },
      ],
      model: 'llama-3.3-70b-versatile',
    });

    return NextResponse.json({ reply: chatCompletion.choices[0]?.message?.content || '' });
  } catch (error) {
    return NextResponse.json({ error: 'Error fetching AI response' }, { status: 500 });
  }
}