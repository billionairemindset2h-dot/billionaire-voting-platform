const SUPABASE_URL = "https://imkcouvscfsjsmpoalda.supabase.co";
const SUPABASE_KEY = "sb_publishable_Velq6YVOUWpUPJDzxL9l7A_RPKJuQGi";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentEventId = null;

async function loadDashboard() {
  const { data: events, error } = await db
    .from("events")
    .select("id, name, vote_price, currency, is_active")
    .order("created_at", { ascending: false });

  if (error) {
    showMessage("Unable to load events: " + error.message, true);
    return;
  }

  document.getElementById("eventCount").textContent = events.length;

  const eventSelect = document.getElementById("eventSelect");
  eventSelect.innerHTML = "";

  if (!events.length) {
    eventSelect.innerHTML = `<option value="">No events found</option>`;
    return;
  }

  events.forEach(event => {
    const option = document.createElement("option");
    option.value = event.id;
    option.textContent = event.name;
    eventSelect.appendChild(option);
  });

  currentEventId = events[0].id;
  eventSelect.value = currentEventId;

  await loadEventData(currentEventId);
}

async function loadEventData(eventId) {
  currentEventId = eventId;

  const { data: contestants, error } = await db
    .from("contestants")
    .select("id, name, code, vote_count, is_active")
    .eq("event_id", eventId)
    .order("name");

  if (error) {
    showMessage("Unable to load contestants: " + error.message, true);
    return;
  }

  document.getElementById("contestantCount").textContent =
    contestants.length;

  const totalVotes = contestants.reduce(
    (sum, contestant) => sum + Number(contestant.vote_count || 0),
    0
  );

  document.getElementById("voteCount").textContent = totalVotes;

  const { data: event } = await db
    .from("events")
    .select("vote_price, currency")
    .eq("id", eventId)
    .single();

  const revenue = totalVotes * Number(event?.vote_price || 0);

  document.getElementById("revenue").textContent =
    `${event?.currency || "GHS"} ${revenue.toFixed(2)}`;

  renderContestants(contestants);
}

function renderContestants(contestants) {
  const table = document.getElementById("contestantTable");

  table.innerHTML = "";

  contestants.forEach(contestant => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${escapeHtml(contestant.name)}</td>
      <td>${escapeHtml(contestant.code)}</td>
      <td>${Number(contestant.vote_count || 0)}</td>
      <td>${contestant.is_active ? "Active" : "Inactive"}</td>
      <td>
        <button
          class="action-btn"
          onclick="editContestant('${contestant.id}')">
          Edit
        </button>
      </td>
    `;

    table.appendChild(row);
  });
}

async function editContestant(contestantId) {
  const newCode = prompt(
    "Enter the new contestant code:"
  );

  if (!newCode) return;

  const { error } = await db
    .from("contestants")
    .update({ code: newCode.trim() })
    .eq("id", contestantId);

  if (error) {
    showMessage("Could not update contestant code: " + error.message, true);
    return;
  }

  showMessage("Contestant code updated successfully.", false);

  await loadEventData(currentEventId);
}

function showMessage(message, isError) {
  const box = document.getElementById("loginMessage");
  box.textContent = message;
  box.className = isError ? "message error" : "message success";
  box.style.display = "block";

  setTimeout(() => {
    box.style.display = "none";
  }, 4000);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document
  .getElementById("eventSelect")
  .addEventListener("change", event => {
    loadEventData(event.target.value);
  });

loadDashboard();

document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const { error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    showMessage("Login failed: " + error.message, true);
    return;
  }

  document.getElementById("loginSection").style.display = "none";
  document.getElementById("dashboardSection").style.display = "block";

  await loadDashboard();
});
document.getElementById("createEventBtn").addEventListener("click", async () => {
  const name = document.getElementById("newEventName").value.trim();
  const price = Number(document.getElementById("newEventPrice").value);
  const message = document.getElementById("eventMessage");

  if (!name) {
    message.textContent = "Please enter an event name.";
    message.className = "message error";
    return;
  }

  if (!price || price <= 0) {
    message.textContent = "Please enter a valid vote price.";
    message.className = "message error";
    return;
  }

  const { data, error } = await db
    .from("events")
    .insert([{
      name: name,
      vote_price: price,
      currency: "GHS",
      is_active: true
    }])
    .select()
    .single();

  if (error) {
    message.textContent = "Could not create event: " + error.message;
    message.className = "message error";
    return;
  }

  message.textContent = "Event created successfully.";
  message.className = "message success";

  document.getElementById("newEventName").value = "";
  document.getElementById("newEventPrice").value = "";

  await loadDashboard();
});
document.getElementById("forgotPasswordBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();

  if (!email) {
    showMessage("Please enter your email address first.", true);
    return;
  }

  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: "https://billionairemindset2h-dot.github.io/billionaire-voting-platform/admin.html"
  });

  if (error) {
    showMessage("Password reset failed: " + error.message, true);
    return;
  }

  showMessage("Password reset instructions have been sent to your email.", false);
});
db.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    document.getElementById("loginSection").style.display = "none";
    document.getElementById("dashboardSection").style.display = "none";
    document.getElementById("resetPasswordSection").style.display = "block";
  }
});

document.getElementById("resetPasswordBtn").addEventListener("click", async () => {
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const message = document.getElementById("resetMessage");

  if (!newPassword || !confirmPassword) {
    message.textContent = "Please enter and confirm your new password.";
    message.className = "message error";
    return;
  }

  if (newPassword !== confirmPassword) {
    message.textContent = "The passwords do not match.";
    message.className = "message error";
    return;
  }

  if (newPassword.length < 6) {
    message.textContent = "Password must be at least 6 characters.";
    message.className = "message error";
    return;
  }

  const { error } = await db.auth.updateUser({
    password: newPassword
  });

  if (error) {
    message.textContent = "Password update failed: " + error.message;
    message.className = "message error";
    return;
  }

  message.textContent = "Password updated successfully. You can now log in.";
  message.className = "message success";

  setTimeout(() => {
    document.getElementById("resetPasswordSection").style.display = "none";
    document.getElementById("loginSection").style.display = "block";
  }, 2000);
});
