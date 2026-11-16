
const input = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const messages = document.getElementById("messages");

const API_URL =
  "https://jarvis-ai-backend.darlaniteesh86.workers.dev";

function addMessage(text, sender) {
  const message = document.createElement("div");
  message.className = "message";
  message.style.marginBottom = "12px";
  message.textContent = sender + ": " + text;
  messages.appendChild(message);
  messages.scrollTop = messages.scrollHeight;
}

async function sendMessage() {
  const text = input.value.trim();

  if (!text || sendBtn.disabled) return;

  addMessage(text, "YOU");
  input.value = "";
  sendBtn.disabled = true;

  addMessage("Thinking...", "JARVIS");

  const thinkingMessage = messages.lastElementChild;

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: text
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }

    thinkingMessage.textContent = "JARVIS: " + data.reply;

  } catch (error) {
    thinkingMessage.textContent =
      "JARVIS: Connection error — " + error.message;
  }

  sendBtn.disabled = false;
  messages.scrollTop = messages.scrollHeight;
}

sendBtn.addEventListener("click", sendMessage);

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendMessage();
  }
});
