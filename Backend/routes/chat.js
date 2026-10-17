const express = require("express");
const router = express.Router();

// ── Groq API Key ─────────────────────────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions";

router.post("/ask", async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.json({ success: false, reply: "Please type something." });
    }

    console.log(`\nChat received: "${message}"`);

    // Crisis detection — works without any API
    const crisisWords = ["suicide", "sucide", "kill myself", "end my life",
                         "want to die", "self harm", "hurt myself", "self-harm"];
    const isCrisis = crisisWords.some(w => message.toLowerCase().includes(w));
    if (isCrisis) {
        console.log("⚠️  Crisis message detected");
        return res.json({
            success: true,
            reply: "I'm deeply concerned about you. Please call iCall immediately: 📞 9152987821 — it's free, confidential, and available right now. You are not alone and your life matters. Please also book an emergency session with our counselor."
        });
    }

    try {
        const response = await fetch(GROQ_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        content: `You are a compassionate mental health support assistant for college students at MIT Academy of Engineering, India.
Respond with empathy, warmth, and care.
Never diagnose any condition.
Keep replies concise — 2 to 4 sentences only.
Always recommend booking a counselor for serious issues.
If the student mentions suicide or self-harm, immediately provide helpline: iCall 9152987821.`
                    },
                    {
                        role: "user",
                        content: message
                    }
                ],
                temperature: 0.7,
                max_tokens: 250
            })
        });

        const data = await response.json();
        console.log("Groq status:", response.status);

        if (!response.ok) {
            console.error("Groq Error:", data?.error?.message);
            return res.json({
                success: false,
                reply: "AI is currently unavailable. Please try again in a moment."
            });
        }

        const reply = data.choices?.[0]?.message?.content
                   || "I'm here to listen. Could you tell me more?";

        console.log("✅ Groq replied successfully");
        res.json({ success: true, reply });

    } catch (error) {
        console.error("Fetch Error:", error.message);
        res.json({
            success: false,
            reply: "Cannot connect to AI. Please check your internet and try again."
        });
    }
});

module.exports = router;