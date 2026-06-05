export function setupChat(socket) {
    const input = document.getElementById("chat-input");
    const messages = document.getElementById("chat-messages");
  
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.value.trim()) {
        socket.emit("chat", input.value.trim());
        input.value = "";
      }
    });
  
    socket.on("chat", ({ name, msg }) => {
      const div = document.createElement("div");
      div.textContent = `${name}: ${msg}`;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    });
  }
  