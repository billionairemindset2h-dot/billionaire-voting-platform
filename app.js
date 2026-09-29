const SUPABASE_URL = "https://imkcouvscfsjsmpoalda.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Velq6YVOUWpUPJDzxL9l7A_RPKJuQGi";

const { createClient } = supabase;

const db = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const EVENT_ID =
  new URLSearchParams(window.location.search).get("event") ||
  "e244ef75-dafb-4ba2-8506-2dc033771b1c";
let countdownInterval = null;

function startCountdown(endAt) {
  const timer = document.getElementById("countdown-timer");
  if (!timer || !endAt) return;

  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  const endTime = new Date(endAt).getTime();

  const updateCountdown = () => {
    const remaining = endTime - Date.now();

    if (remaining <= 0) {
      timer.textContent = "Voting has ended.";
      clearInterval(countdownInterval);
      countdownInterval = null;
      if (!document.getElementById("registration-form")) {
  loadVotingPage();
}
      return;
    }

    const totalSeconds = Math.floor(remaining / 1000);

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    timer.textContent =
      `${days}d ${hours}h ${minutes}m ${seconds}s`;
  };

  updateCountdown();

  countdownInterval = setInterval(updateCountdown, 1000);
}
async function loadVotingPage() {
  const app = document.getElementById("app");

  try {
    const { data: event, error: eventError } = await db
      .from("events")
      .select("*")
      .eq("id", EVENT_ID)
      .single();

    if (eventError) throw eventError;
if (event.voting_end_at && new Date(event.voting_end_at) <= new Date()) {
  event.is_active = false;
}
 const votingClosed = !event.is_active;
    
    const { data: contestants, error: contestantError } = await db
      .from("contestants")
      .select("*")
      .eq("event_id", EVENT_ID)
      .eq("is_active", true)
      .order("vote_count", { ascending: false });

    if (contestantError) throw contestantError;

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
      REGISTER HERE
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
  startCountdown(event.voting_end_at);
}
  } catch (error) {
    console.error(error);

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
    const { data, error } = await db.functions.invoke(
      "initialize-paystack-payment",
      {
        body: {
          event_id: EVENT_ID,
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
      throw error;
    }

    if (data && data.success) {
      await loadVotingPage();
     const successMessage = document.createElement("div");
successMessage.className = "payment-success";
successMessage.style.padding = "12px 16px";
successMessage.style.margin = "10px 0 18px";
successMessage.style.borderRadius = "10px";
successMessage.style.fontSize = "15px";
successMessage.style.lineHeight = "1.4";  
      successMessage.style.maxWidth = "600px";
successMessage.style.boxSizing = "border-box";
const recordedVotes = Number(sessionStorage.getItem("pendingVoteCount")) || Number(data.votes) || 0;
      const recordedContestantName = sessionStorage.getItem("pendingContestantName") || "this contestant";
const voteLabel = recordedVotes === 1 ? "vote" : "votes";
const verb = recordedVotes === 1 ? "has" : "have";
      
      successMessage.innerHTML = `
  <h3>Payment Successful!</h3>
 <p>Thank you for voting for ${recordedContestantName}, we are grateful.</p>
<p><strong>${recordedVotes} ${voteLabel} ${verb} been successfully recorded.</strong></p> 
`;
document.getElementById("app").prepend(successMessage);
      
      setTimeout(() => {
  successMessage.remove();
}, 10000);
    } else {
      alert(
        data?.message ||
        "Payment could not be verified. Please contact the administrator."
      );
    }

  } catch (error) {
    console.error("Payment verification error:", error);

    alert(
      "We could not verify your payment. Please contact the administrator."
    );
  }

  const cleanUrl = new URL(window.location.href);
cleanUrl.searchParams.delete("reference");

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


async function startRegistration() {
  const app = document.getElementById("app");

    if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  
  const { data: event, error: eventError } = await db
    .from("events")
    .select("*")
    .eq("id", EVENT_ID)
    .single();

  if (eventError || !event) {
    alert("Unable to load event information.");
    return;
  }

  if (
    event.registration_end_at &&
    new Date(event.registration_end_at) <= new Date()
  ) {
    alert("Registration for this event has ended.");
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
    .addEventListener("submit", function (e) {
      e.preventDefault();
      alert("Registration form received. Payment connection will be added next.");
    });
}
window.addEventListener("load", () => {
  loadVotingPage();
  handlePaymentReturn();
});
