// Quick test: can we use the z-ai-web-dev-sdk to translate subtitle cues?
import ZAI from "../node_modules/z-ai-web-dev-sdk/dist/index.js";

async function main() {
  const zai = await ZAI.create();
  
  // Test with a small batch of subtitle cues
  const cues = [
    "Hey, I fell asleep in front of the TV waiting for you.",
    "Are you coming home tonight?",
    "Or should I just go to bed alone?",
    "Do you remember the noodle stand downtown?",
  ];
  
  const prompt = `Translate the following English subtitle lines to Simplified Chinese (简体中文). 
Output ONLY the translated lines, one per line, prefixed with the line number. Do not add any explanation.

Format:
1. <translation>
2. <translation>
...

Lines to translate:
${cues.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;
  
  console.log("Sending translation request...");
  const res = await zai.chat.completions.create({
    messages: [
      { role: "system", content: "You are a professional subtitle translator. Translate English to Simplified Chinese. Preserve the meaning and tone. Output only the translations." },
      { role: "user", content: prompt },
    ],
  });
  
  console.log("Response:", JSON.stringify(res, null, 2).slice(0, 2000));
}

main().catch(e => { console.error(e); process.exit(1); });
