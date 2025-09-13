const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-parse');
const { YoutubeTranscript } = require('youtube-transcript');
require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const upload = multer({ storage: multer.memoryStorage() });

const generateContent = async (prompt, expectJson = false) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();

        if (expectJson) {
            const sanitizedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(sanitizedText);
        }
        return text;

    } catch (error) {
        console.error("----------- DETAILED GOOGLE AI ERROR -----------");
        console.error(error);
        if (error.message && error.message.includes('API key not valid')) {
             throw new Error('Your Google AI API key is not valid. Please check your .env file.');
        }
        throw new Error("Failed to generate content from AI model.");
    }
};

app.post('/generate-all-content', upload.single('document'), async (req, res) => {
    try {
        let inputText = '';
        if (req.body.text) {
            inputText = req.body.text;
        } else if (req.body.url) {
            const transcript = await YoutubeTranscript.fetchTranscript(req.body.url);
            inputText = transcript.map(t => t.text).join(' ').substring(0, 15000);
        } else if (req.file) {
            const data = await pdf(req.file.buffer);
            inputText = data.text.substring(0, 15000);
        } else {
            return res.status(400).json({ error: "No input provided." });
        }

        // --- Only one of each prompt is declared here ---
        const lessonPrompt = `Act as an expert educator creating a lesson plan. Based on the following text, create a structured learning module. IMPORTANT: Your entire response must be ONLY the raw JSON object, starting with { and ending with }. The JSON object must have two keys: "flowchart" and "slides". 
        1. The "flowchart" value must be a JSON array of short strings, representing the titles of the lesson steps in order.
        2. The "slides" value must be a JSON array of objects, where each object represents a slide and has two keys: "title" and "content".
        The titles in the flowchart should correspond to the titles of the slides. Text: "${inputText}"`;
        
        const quizPrompt = `Based on the text, create a 5-question multiple-choice quiz that tests conceptual understanding, not just recall. IMPORTANT: Your response must be ONLY the raw JSON array... Text: "${inputText}"`;
        const assignmentPrompt = `Based on the text, create a short, practical assignment with 2-3 real-world tasks that would require a student to apply their knowledge. Your response should be plain text. Text: "${inputText}"`;
        
        const [lesson, quiz, assignment] = await Promise.all([
            generateContent(lessonPrompt, true),
            generateContent(quizPrompt, true),    
            generateContent(assignmentPrompt, false) 
        ]);
        
        res.json({ lesson, quiz, assignment });

    } catch (error) {
        res.status(500).json({ error: error.message || "An unknown server error occurred." });
    }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});