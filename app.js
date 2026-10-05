const SUPABASE_URL = "https://imkcouvscfsjsmpoalda.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Velq6YVOUWpUPJDzxL9l7A_RPKJuQGi";

const { createClient } = supabase;

const db = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

let currentEventId = new URLSearchParams(window.location.search).get("event");
let countdownIntervals = {};
let pageLoadVersion = 0;
let eventVisibilityColumnAvailable = true;

function isMissingVisibilityColumn(error) {
  const message = String(error?.message || "");
  return error?.code === "42703" || error?.code === "PGRST204" ||
    (/is_visible/i.test(message) && /(column|schema cache|does not exist|not found)/i.test(message));
}

function startCountdown(endAt, timerId, endedText, onEnded) {
  const timer = document.getElementById(timerId);
  if (!timer || !endAt) return;

  if (countdownIntervals[timerId]) {
    clearInterval(countdownIntervals[timerId]);
  }

  const endTime = new Date(endAt).getTime();
  const updateCountdown = () => {
    const remaining = endTime - Date.now();

    if (remaining <= 0) {
      timer.textContent = endedText;
      clearInterval(countdownIntervals[timerId]);
      delete countdownIntervals[timerId];
      if (onEnded) onEnded();
      return;
    }

    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    timer.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  };

  updateCountdown();
  if (endTime > Date.now()) {
    countdownIntervals[timerId] = setInterval(updateCountdown, 1000);
  }
}

function updateEventUrl(eventId) {
  const url = new URL(window.location.href);
  if (eventId) url.searchParams.set("event", eventId);
  else url.searchParams.delete("event");
  window.history.replaceState({}, document.title, url.pathname + url.search);
}

async function selectEvent(eventId) {
  currentEventId = eventId;
  updateEventUrl(eventId);
  await loadVotingPage(eventId);
}

function populateEventSelector(events, selectedEventId) {
  const selector = document.getElementById("event-select");
  if (!selector) return;

  selector.innerHTML = `<option value="">Choose an event</option>` + events.map(event => {
    const votingEnded = event.voting_end_at && new Date(event.voting_end_at) <= new Date();
    const votingOpen = event.is_active && !votingEnded;
    const registrationOpen = event.registration_enabled &&
      (!event.registration_end_at || new Date(event.registration_end_at) > new Date());
    const status = votingOpen ? "Voting open" : registrationOpen ? "Registration open" : "Voting closed";
    return `<option value="${escapeHtml(event.id)}">${escapeHtml(event.name)} — ${status}</option>`;
  }).join("");

  selector.disabled = events.length === 0;
  selector.value = selectedEventId || "";
  selector.onchange = () => selectEvent(selector.value);
}

async function loadVotingPage(requestedEventId = currentEventId) {
  const app = document.getElementById("app");
  const loadVersion = ++pageLoadVersion;
  Object.values(countdownIntervals).forEach(clearInterval);
  countdownIntervals = {};

  try {
    let eventsResult = await db
      .from("events")
      .select("id, name, is_active, is_visible, voting_end_at, registration_enabled, registration_end_at, created_at")
      .eq("is_visible", true)
      .order("created_at", { ascending: false });

    if (eventsResult.error && isMissingVisibilityColumn(eventsResult.error)) {
      eventVisibilityColumnAvailable = false;
      eventsResult = await db
        .from("events")
        .select("id, name, is_active, voting_end_at, registration_enabled, registration_end_at, created_at")
        .order("created_at", { ascending: false });
    }

    const { data: events, error: eventsError } = eventsResult;

    if (eventsError) throw eventsError;
    if (loadVersion !== pageLoadVersion) return;

    const eventsAvailable = events || [];
    if (requestedEventId && !eventsAvailable.some(event => event.id === requestedEventId)) {
      populateEventSelector(eventsAvailable, "");
      app.innerHTML = `<div class="empty">This event is not currently available.</div>`;
      return;
    }

    let selectedEventId = requestedEventId;
    if (!selectedEventId || !eventsAvailable.some(event => event.id === selectedEventId)) {
      const firstOpenEvent = eventsAvailable.find(event => {
        const votingOpen = event.is_active &&
          (!event.voting_end_at || new Date(event.voting_end_at) > new Date());
        const registrationOpen = event.registration_enabled &&
          (!event.registration_end_at || new Date(event.registration_end_at) > new Date());
        return votingOpen || registrationOpen;
      });
      selectedEventId = (firstOpenEvent || eventsAvailable[0])?.id || null;
    }

    currentEventId = selectedEventId;
    populateEventSelector(eventsAvailable, selectedEventId);
    if (!selectedEventId) {
      app.innerHTML = `<div class="empty">There are no events available right now.</div>`;
      return;
    }
    updateEventUrl(selectedEventId);

    let eventQuery = db
      .from("events")
      .select("*")
      .eq("id", selectedEventId);
    if (eventVisibilityColumnAvailable) eventQuery = eventQuery.eq("is_visible", true);
    let eventResult = await eventQuery.single();

    if (eventResult.error && isMissingVisibilityColumn(eventResult.error)) {
      eventVisibilityColumnAvailable = false;
      eventResult = await db
        .from("events")
        .select("*")
        .eq("id", selectedEventId)
        .single();
    }

    const { data: event, error: eventError } = eventResult;

    if (eventError) throw eventError;
    if (loadVersion !== pageLoadVersion) return;

    const votingEnded = event.voting_end_at && new Date(event.voting_end_at) <= new Date();
    const votingClosed = !event.is_active || votingEnded;
    
    const { data: contestants, error: contestantError } = await db
      .from("contestants")
      .select("*")
      .eq("event_id", selectedEventId)
      .eq("is_active", true)
      .order("vote_count", { ascending: false });

    if (contestantError) throw contestantError;
    if (loadVersion !== pageLoadVersion) return;

    let html = `
      <h3>${escapeHtml(event.name)}</h3>

      <p class="event-description">
        ${escapeHtml(event.description || "")}
      </p>

      <p>
        <strong>Price per vote:</strong>
        ${escapeHtml(event.currency)} ${Number(event.vote_price).toFixed(2)}
      </p>
${event.voting_end_at ? `
  <div
    id="voting-countdown"
    style="
      margin: 15px 0;
      padding: 12px;
      border-radius: 10px;
      background: #fff8e1;
      border: 1px solid #d4af37;
      text-align: center;
      font-weight: 700;
      color: #0b1f4d;
    "
  >
    Voting ends in: <span id="countdown-timer">Loading...</span>
  </div>
` : ""}
${event.voting_end_at ? `
  <p class="event-deadline">Voting deadline: <strong>${escapeHtml(formatEventDate(event.voting_end_at))}</strong></p>
` : ""}
${event.registration_enabled ? `
  <div
    style="
      margin: 15px 0;
      padding: 15px;
      border-radius: 10px;
      background: #0b1f4d;
      text-align: center;
    "
  >
    <div style="color: white; font-weight: 700; margin-bottom: 10px;">
      EVENT REGISTRATION
    </div>

    <div style="color: #d4af37; font-size: 18px; font-weight: 700; margin-bottom: 12px;">
      Registration Fee: ${escapeHtml(event.currency)} ${Number(event.registration_price).toFixed(2)}
    </div>
${event.registration_end_at ? `
    <p style="color: white; margin: 0 0 10px;">Registration deadline: <strong>${escapeHtml(formatEventDate(event.registration_end_at))}</strong></p>
` : ""}
${event.registration_end_at ? `
  <div
    id="registration-countdown"
    style="
      margin: 12px 0;
      padding: 10px;
      border-radius: 8px;
      background: #fff8e1;
      border: 1px solid #d4af37;
      color: #0b1f4d;
      font-weight: 700;
      text-align: center;
    "
  >
    Registration ends in: <span id="registration-countdown-timer">Loading...</span>
  </div>
` : ""}
    <button
      type="button"
      onclick="startRegistration()"
      ${event.registration_end_at && new Date(event.registration_end_at) <= new Date() ? "disabled" : ""}
      style="
        background: #d4af37;
        color: #0b1f4d;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-weight: 700;
        font-size: 16px;
        cursor: pointer;
      "
    >
      ${event.registration_end_at && new Date(event.registration_end_at) <= new Date() ? "REGISTRATION CLOSED" : "REGISTER HERE"}
    </button>
  </div>
` : ""}
      <br>
    `;

    if (!contestants || contestants.length === 0) {
      html += `
        <div class="empty">
          No contestants are available at the moment.
        </div>
      `;
    } else {
      contestants.forEach(contestant => {
        html += `
          <div class="contestant">
          <div class="contestant-photo">
  ${
    contestant.photo_url
      ? `<img src="${escapeHtml(contestant.photo_url)}" alt="${escapeHtml(contestant.name)}">`
      : `<div class="photo-placeholder">CONTESTANT PHOTO</div>`
  }
</div>
          
            <h4>${escapeHtml(contestant.name)}</h4>

            <span class="code">
              Code: ${escapeHtml(contestant.code)}
            </span>

            <p class="votes">
              Current votes:
              <strong>${Number(contestant.vote_count).toLocaleString()}</strong>
            </p>

            <div class="vote-row">

              <label for="votes-${contestant.id}">
                Number of votes:
              </label>

              <input
                id="votes-${contestant.id}"
                class="vote-input"
                type="number"
                min="1"
                value="1"
              >

             <button
  class="vote-button"
  ${votingClosed ? "disabled" : ""}
  ${votingClosed ? "" : `onclick="prepareVote('${contestant.id}', '${escapeJs(contestant.name)}', ${Number(event.vote_price)}, '${escapeJs(event.currency)}')"` }
>
  ${votingClosed ? "VOTING CLOSED" : "VOTE NOW"}
</button>
            </div>
          </div>
        `;
      });
    }
    
    app.innerHTML = html;
    if (event.voting_end_at) {
      startCountdown(event.voting_end_at, "countdown-timer", "Voting has ended.", () => loadVotingPage(currentEventId));
    }
    if (event.registration_end_at && event.registration_enabled) {
      startCountdown(event.registration_end_at, "registration-countdown-timer", "Registration has ended.", () => loadVotingPage(currentEventId));
    }
  } catch (error) {
    if (loadVersion !== pageLoadVersion) return;
    console.error(error);

    const selector = document.getElementById("event-select");
    if (selector) {
      selector.disabled = true;
      selector.innerHTML = `<option value="">Unable to load events</option>`;
    }

    app.innerHTML = `
      <div class="error">
        <h3>Unable to load voting information</h3>
        <p>Please try again later.</p>
      </div>
    `;
  }
}

async function prepareVote(contestantId, contestantName, price, currency) {
  const input = document.getElementById(`votes-${contestantId}`);
  const votes = parseInt(input.value, 10);

  if (!Number.isInteger(votes) || votes < 1) {
  alert("Please enter a valid number of votes.");
  return;
}

sessionStorage.setItem("pendingVoteCount", String(votes));
sessionStorage.setItem("pendingContestantName", contestantName);
  try {
    const voteEventId = currentEventId;
    let latestEventResult = await db
      .from("events")
      .select("is_visible, is_active, voting_end_at")
      .eq("id", voteEventId)
      .single();

    if (latestEventResult.error && isMissingVisibilityColumn(latestEventResult.error)) {
      eventVisibilityColumnAvailable = false;
      latestEventResult = await db
        .from("events")
        .select("is_active, voting_end_at")
        .eq("id", voteEventId)
        .single();
    }

    const { data: latestEvent, error: latestEventError } = latestEventResult;

    if (latestEventError || (eventVisibilityColumnAvailable && !latestEvent?.is_visible)) {
      throw new Error("This event is no longer available.");
    }
    if (
      !latestEvent.is_active ||
      latestEvent.voting_end_at && new Date(latestEvent.voting_end_at) <= new Date()
    ) {
      throw new Error("Voting for this event has closed.");
    }

    const { data, error } = await db.functions.invoke(
      "initialize-paystack-payment",
      {
        body: {
          event_id: voteEventId,
          contestant_id: contestantId,
          email: `voter-${crypto.randomUUID()}@example.com`,
          votes: votes
        }
      }
    );

    if (error) {
      console.error("Payment initialization error:", error);
      throw new Error(error.message || "Unable to start payment.");
    }

    if (!data || !data.success || !data.authorization_url) {
      throw new Error(
        data?.message || "Unable to initialize payment with Paystack."
      );
    }

    window.location.href = data.authorization_url;

  } catch (error) {
    console.error(error);

    alert(
      error.message ||
      "Something went wrong while starting the payment. Please try again."
    );
  }
}

async function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  const reference = params.get("reference");
  const isRegistrationReturn = params.get("registration") === "success";

  if (!reference) {
    return;
  }

  try {
    const { data, error } = await db.functions.invoke(
      "verify-paystack-payment",
      {
        body: {
          reference: reference
        }
      }
    );

    if (error) {
      let message = error.message;
      if (error.context instanceof Response) {
        try {
          const responseBody = await error.context.clone().json();
          message = responseBody?.message || message;
        } catch {
          // Keep the SDK error message when the response is not JSON.
        }
      }
      throw new Error(message);
    }

    if (data && data.success) {
      await loadVotingPage(currentEventId);
      const successMessage = document.createElement("div");
      successMessage.className = "payment-success";
      successMessage.style.padding = "12px 16px";
      successMessage.style.margin = "10px 0 18px";
      successMessage.style.borderRadius = "10px";
      successMessage.style.fontSize = "15px";
      successMessage.style.lineHeight = "1.4";
      successMessage.style.maxWidth = "600px";
      successMessage.style.boxSizing = "border-box";

      const heading = document.createElement("h3");
      const message = document.createElement("p");

      if (isRegistrationReturn || data.type === "registration") {
        heading.textContent = "Registration payment confirmed";
        message.textContent = data.registration_number
          ? `Your registration ${data.registration_number} has been submitted. Keep this number for your records.`
          : "Your registration payment has been confirmed and your application has been submitted.";
        sessionStorage.removeItem("pendingVoteCount");
        sessionStorage.removeItem("pendingContestantName");
      } else {
        const recordedVotes = Number(sessionStorage.getItem("pendingVoteCount")) || Number(data.votes) || 0;
        const recordedContestantName = sessionStorage.getItem("pendingContestantName") || "this contestant";
        const voteLabel = recordedVotes === 1 ? "vote" : "votes";
        const verb = recordedVotes === 1 ? "has" : "have";
        heading.textContent = "Payment successful";
        message.textContent = `Thank you for voting for ${recordedContestantName}. Your ${recordedVotes} ${voteLabel} ${verb} been recorded.`;
      }

      successMessage.append(heading, message);
      document.getElementById("app").prepend(successMessage);

      setTimeout(() => successMessage.remove(), 10000);
    } else {
      const defaultMessage = isRegistrationReturn
        ? "Registration payment could not be verified. Please contact the administrator."
        : "Payment could not be verified. Please contact the administrator.";
      alert(data?.message || defaultMessage);
    }

  } catch (error) {
    console.error("Payment verification error:", error);
    const fallbackMessage = isRegistrationReturn
      ? "We could not verify your registration payment. Please contact the administrator."
      : "We could not verify your payment. Please contact the administrator.";
    alert(error.message || fallbackMessage);
  }

  const cleanUrl = new URL(window.location.href);
cleanUrl.searchParams.delete("reference");
cleanUrl.searchParams.delete("registration");

window.history.replaceState(
  {},
  document.title,
  cleanUrl.pathname + cleanUrl.search
);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJs(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function formatEventDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}


async function startRegistration() {
  const app = document.getElementById("app");
  const registrationEventId = currentEventId;

  Object.values(countdownIntervals).forEach(clearInterval);
  countdownIntervals = {};
  
  const { data: event, error: eventError } = await db
    .from("events")
    .select("*")
    .eq("id", registrationEventId)
    .single();

  if (registrationEventId !== currentEventId) return;

  if (eventError || !event) {
    alert("Unable to load event information.");
    return;
  }

  if (
    !event.registration_enabled ||
    event.registration_end_at &&
    new Date(event.registration_end_at) <= new Date()
  ) {
    alert("Registration for this event is unavailable or has ended.");
    return;
  }

  const eventCurrency = event.currency || "GHS";
  const eventRegistrationPrice = event.registration_price || 0;

  app.innerHTML = `
    <div style="
      max-width: 600px;
      margin: 20px auto;
      background: white;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.15);
    ">

      <h2 style="
        text-align: center;
        color: #0b1f4d;
        margin-bottom: 8px;
      ">
        EVENT REGISTRATION
      </h2>

      <p style="text-align: center; color: #0b1f4d; font-weight: 700; margin-bottom: 16px;">
        ${escapeHtml(event.name)}
      </p>

      <p style="
        text-align: center;
        color: #555;
        margin-bottom: 20px;
      ">
        Registration Fee:
        <strong>
          ${escapeHtml(eventCurrency || "GHS")}
          ${Number(eventRegistrationPrice || 20).toFixed(2)}
        </strong>
      </p>

      <form id="registration-form">

        <label>Full Name</label>
        <input
          type="text"
          id="reg-name"
          required
          placeholder="Enter full name"
          style="width:100%; padding:12px; margin:6px 0 15px; box-sizing:border-box;"
        >

        <label>Age</label>
        <input
          type="number"
          id="reg-age"
          required
          min="1"
          max="120"
          placeholder="Enter age"
          style="width:100%; padding:12px; margin:6px 0 15px; box-sizing:border-box;"
        >

        <label>Sex</label>
        <select
          id="reg-sex"
          required
          style="width:100%; padding:12px; margin:6px 0 15px; box-sizing:border-box;"
        >
          <option value="">Select sex</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>

        <label>Primary Contact</label>
        <input
          type="tel"
          id="reg-primary-contact"
          required
          placeholder="e.g. 0240000000"
          style="width:100%; padding:12px; margin:6px 0 15px; box-sizing:border-box;"
        >

        <label>Alternative Contact</label>
        <input
          type="tel"
          id="reg-alternative-contact"
          placeholder="Optional"
          style="width:100%; padding:12px; margin:6px 0 15px; box-sizing:border-box;"
        >

        <label>Email Address</label>
        <input
          type="email"
          id="reg-email"
          required
          placeholder="Enter email address"
          style="width:100%; padding:12px; margin:6px 0 15px; box-sizing:border-box;"
        >

        <label>Passport / Contestant Photo</label>
        <input
          type="file"
          id="reg-photo"
          accept="image/*"
          style="width:100%; padding:12px; margin:6px 0 20px; box-sizing:border-box;"
        >

        <button
          type="submit"
          style="
            width:100%;
            background:#d4af37;
            color:#0b1f4d;
            border:none;
            padding:14px;
            border-radius:8px;
            font-weight:700;
            font-size:16px;
            cursor:pointer;
          "
        >
          PROCEED TO PAYMENT
        </button>

        <button
          type="button"
          onclick="loadVotingPage()"
          style="
            width:100%;
            margin-top:10px;
            background:#eee;
            color:#333;
            border:none;
            padding:12px;
            border-radius:8px;
            cursor:pointer;
          "
        >
          CANCEL
        </button>

      </form>
    </div>
  `;

  document
  .getElementById("registration-form")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "PROCESSING...";

    try {
      let latestEventResult = await db
        .from("events")
        .select("is_visible, registration_enabled, registration_end_at")
        .eq("id", registrationEventId)
        .single();

      if (latestEventResult.error && isMissingVisibilityColumn(latestEventResult.error)) {
        eventVisibilityColumnAvailable = false;
        latestEventResult = await db
          .from("events")
          .select("registration_enabled, registration_end_at")
          .eq("id", registrationEventId)
          .single();
      }

      const { data: latestEvent, error: latestEventError } = latestEventResult;

      if (
        latestEventError ||
        (eventVisibilityColumnAvailable && !latestEvent?.is_visible) ||
        !latestEvent.registration_enabled ||
        latestEvent.registration_end_at && new Date(latestEvent.registration_end_at) <= new Date()
      ) {
        throw new Error("Registration for this event is no longer available.");
      }

      const payload = {
        event_id: registrationEventId,
        name: document.getElementById("reg-name").value.trim(),
        age: Number(document.getElementById("reg-age").value),
        sex: document.getElementById("reg-sex").value,
        primary_contact: document.getElementById("reg-primary-contact").value.trim(),
        alternative_contact: document.getElementById("reg-alternative-contact").value.trim(),
        email: document.getElementById("reg-email").value.trim(),
        photo_path: ""
      };

      const response = await fetch(
        "https://imkcouvscfsjsmpoalda.supabase.co/functions/v1/initialize-registration-payment",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to start registration payment.");
      }

      window.location.href = result.authorization_url;

    } catch (error) {
      console.error(error);
      alert(error.message || "Unable to start registration payment.");

      submitButton.disabled = false;
      submitButton.textContent = "PROCEED TO PAYMENT";
    }
  });
}
window.addEventListener("load", async () => {
  await loadVotingPage(currentEventId);
  await handlePaymentReturn();
});

window.addEventListener("popstate", () => {
  currentEventId = new URLSearchParams(window.location.search).get("event");
  loadVotingPage(currentEventId);
});
