import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

async function generate() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not found');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: "A high-quality, professional circular logo for a volleyball club named 'Guerreiros Volleyball Club'. The logo should be gold on a transparent background. In the center, there is a Spartan helmet. On the left, a male volleyball player in action. On the right, a female volleyball player in action. At the bottom, two crossed swords with a volleyball in the middle. The text 'GUERREIROS' is large and bold in the middle, with 'DO VÔLEI' underneath it. At the top, it says 'DESDE 2025'. The style should be clean, modern, and athletic. Transparent background.",
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part && part.inlineData) {
      const buffer = Buffer.from(part.inlineData.data, 'base64');
      const publicDir = path.join(process.cwd(), 'public');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      fs.writeFileSync(path.join(publicDir, 'logo.png'), buffer);
      console.log('Logo generated and saved to public/logo.png');
    } else {
      console.error('No image generated in response');
      console.log('Response:', JSON.stringify(response, null, 2));
    }
  } catch (error) {
    console.error('Error generating logo:', error);
  }
}

generate();
