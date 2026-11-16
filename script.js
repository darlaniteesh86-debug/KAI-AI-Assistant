
const input = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const messages = document.getElementById("messages");

function addMessage(text, sender) {
  const message = document.createElement("div");
  message.className = "message";
  message.style.marginBottom = "12px";
  message.textContent = sender + ": " + text;
  messages.appendChild(message);
  messages.scrollTop = messages.scrollHeight;
}

function getResponse(text) {
  const command = text.toLowerCase().trim();

  if (command.includes("hello") || command.includes("hi")) {
    return "Hello! How can I help you?";
  }

  if (command.includes("your name")) {
    return "I am JARVIS, your personal AI assistant.";
  }

  if (command.includes("time")) {
    return "The current time is " +
      new Date().toLocaleTimeString();
  }

  if (command.includes("date")) {
    return "Today's date is " +
      new Date().toLocaleDateString();
  }

  if (command.includes("who created you")) {
    return "You are building me!";
  }

  return "I am ready to help. My AI brain will be connected soon.";
}

function sendMessage() {
  const text = input.value.trim();

  if (!text) return;

  addMessage(text, "YOU");
  input.value = "";

  setTimeout(() => {
    addMessage(getResponse(text), "JARVIS");
  }, 400);
}

sendBtn.addEventListener("click", sendMessage);

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendMessage();
  }
});

