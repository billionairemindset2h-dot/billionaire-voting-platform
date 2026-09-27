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
      loadVotingPage();
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
    if (!event.is_active) {
  app.innerHTML = `
    <div class="error">
      <h3>VOTING OFFICIALLY CLOSED</h3>
      <p>Voting for this event is currently closed.</p>
    </div>
  `;
  return;
}
    
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
                onclick="prepareVote('${contestant.id}', '${escapeJs(contestant.name)}', ${Number(event.vote_price)}, '${escapeJs(event.currency)}')"
              >
                VOTE NOW
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

window.addEventListener("load", () => {
  loadVotingPage();
  handlePaymentReturn();
});
