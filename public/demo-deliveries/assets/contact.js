const form = document.querySelector("#contact-form");
const status = document.querySelector("#form-status");

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  status.textContent = "Thanks — your message is ready for the studio. This demo does not send data to a server.";
  form.reset();
});
