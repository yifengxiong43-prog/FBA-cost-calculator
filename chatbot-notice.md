# Chatbot integration

Reference: https://github.com/HeyPuter/puter and https://docs.puter.com/AI/chat/ . The website loads the official Puter.js browser SDK from https://js.puter.com/v2/ .

Clicking "问机器人" sends the question to Puter AI from the asker's browser. Puter may ask that person to sign in. The question and answer are also broadcast to the current Supabase chat room; no AI secret is stored in the static website. Only the asker's own recent bot exchanges are included as follow-up context. Other room messages are not sent to Puter.
