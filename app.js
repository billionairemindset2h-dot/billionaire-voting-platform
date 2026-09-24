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

async function loadVotingPage() {
  const app = document.getElementById("app");

  try {
    const { data: event, error: eventError } = await db
      .from("events")
      .select("*")
      .eq("id", EVENT_ID)
      .eq("is_active", true)
      .single();

    if (eventError) throw eventError;

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
      
const recordedVotes = Number(sessionStorage.getItem("pendingVoteCount")) || Number(data.votes) || 0;
const voteLabel = recordedVotes === 1 ? "vote" : "votes";
const verb = recordedVotes === 1 ? "has" : "have";
      
      successMessage.innerHTML = `
  <h3>Payment Successful!</h3>
  <p>Thank you for voting for this contestant.</p>
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
