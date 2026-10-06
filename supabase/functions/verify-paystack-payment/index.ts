import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendRegistrationNotification(supabase: any, registration: any) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("REGISTRATION_EMAIL_FROM");
  if (!resendApiKey || !from) {
    console.error("Registration email is not configured: set RESEND_API_KEY and REGISTRATION_EMAIL_FROM.");
    await supabase
      .from("registrations")
      .update({ email_notification_status: "failed" })
      .eq("id", registration.id);
    return false;
  }

  try {
    const { data: event } = await supabase
      .from("events")
      .select("name")
      .eq("id", registration.event_id)
      .maybeSingle();
    const eventName = event?.name || registration.event_id;
    const details = [
      ["Event", eventName],
      ["Registration number", registration.registration_number],
      ["Name", registration.name],
      ["Age", registration.age],
      ["Sex", registration.sex],
      ["Primary contact", registration.primary_contact],
      ["Alternative contact", registration.alternative_contact],
      ["Applicant email", registration.email],
      ["Photo path", registration.photo_path],
      ["Payment amount", `${registration.currency} ${registration.amount_paid}`],
      ["Payment reference", registration.payment_reference],
      ["Submitted", registration.created_at],
    ];
    const rows = details.map(([label, value]) =>
      `<tr><th style="text-align:left;padding:8px;border-bottom:1px solid #ddd">${escapeHtml(label)}</th><td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(value || "—")}</td></tr>`
    ).join("");
    const text = details.map(([label, value]) => `${label}: ${value || "—"}`).join("\n");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `registration-notification/${registration.id}`,
      },
      body: JSON.stringify({
        from,
        to: ["billionairemindset2h@gmail.com"],
        subject: `Paid event registration: ${registration.registration_number}`,
        html: `<h2>New paid event registration</h2><table style="border-collapse:collapse;width:100%">${rows}</table>`,
        text,
      }),
    });

    if (!response.ok) {
      const providerError = await response.text();
      console.error("Registration email provider returned status:", response.status, providerError);
      await supabase
        .from("registrations")
        .update({ email_notification_status: "failed" })
        .eq("id", registration.id);
      return false;
    }

    const { error: updateError } = await supabase
      .from("registrations")
      .update({
        email_notification_status: "sent",
        email_notification_sent_at: new Date().toISOString(),
      })
      .eq("id", registration.id);

    if (updateError) {
      console.error("Could not save registration email status:", updateError.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Registration email delivery failed:", error);
    await supabase
      .from("registrations")
      .update({ email_notification_status: "failed" })
      .eq("id", registration.id);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { reference } = await req.json();

    if (!reference || typeof reference !== "string") {
      return jsonResponse({
        success: false,
        message: "Payment reference is required.",
      }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackSecret) {
      throw new Error("PAYSTACK_SECRET_KEY is not configured.");
    }

    // Voting payments live in payments; event registrations keep their own
    // reference on registrations. Resolve the record before verifying Paystack.
    const { data: payment, error: paymentLookupError } = await supabase
      .from("payments")
      .select("*")
      .eq("reference", reference)
      .maybeSingle();

    if (paymentLookupError) {
      throw paymentLookupError;
    }

    let registration = null;
    if (!payment) {
      const { data, error } = await supabase
        .from("registrations")
        .select("id, event_id, registration_number, payment_reference, amount_paid, currency, payment_status, email_notification_status, name, age, sex, primary_contact, alternative_contact, photo_path, created_at")
        .eq("payment_reference", reference)
        .maybeSingle();

      if (error) {
        throw error;
      }
      registration = data;
    }

    if (!payment && !registration) {
      return jsonResponse({
        success: false,
        message: "Payment record not found.",
      }, 404);
    }

    if (registration?.payment_status === "success") {
      if (["pending", "failed"].includes(registration.email_notification_status)) {
        await sendRegistrationNotification(supabase, registration);
      }
      return jsonResponse({
        success: true,
        type: "registration",
        message: "Registration payment has already been verified.",
        registration_number: registration.registration_number,
      });
    }

    if (payment?.status === "success") {
      return jsonResponse({
        success: true,
        type: "vote",
        message: "Payment has already been processed.",
        votes: payment.votes,
      });
    }

    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
        },
      },
    );
    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      return jsonResponse({
        success: false,
        message: "Unable to verify payment with Paystack.",
      }, 400);
    }

    const transaction = paystackData.data;
    const expectedAmount = Math.round(
      Number(payment ? payment.amount : registration.amount_paid) * 100,
    );
    const expectedCurrency = payment ? payment.currency : registration.currency;

    if (
      transaction.status !== "success" ||
      Number(transaction.amount) !== expectedAmount ||
      String(transaction.currency).toUpperCase() !==
        String(expectedCurrency).toUpperCase()
    ) {
      if (payment) {
        const { error } = await supabase
          .from("payments")
          .update({ status: "failed" })
          .eq("id", payment.id)
          .eq("status", "pending");
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("registrations")
          .update({ payment_status: "failed" })
          .eq("id", registration.id)
          .neq("payment_status", "success");
        if (error) throw error;
      }

      return jsonResponse({
        success: false,
        message: "Payment verification failed.",
      }, 400);
    }

    if (registration) {
      const { data: updatedRegistration, error } = await supabase
        .from("registrations")
        .update({
          payment_status: "success",
          payment_verified_at: new Date().toISOString(),
          email_notification_status: "pending",
        })
        .eq("id", registration.id)
        .select("registration_number")
        .single();

      if (error) {
        throw error;
      }

      await sendRegistrationNotification(supabase, {
        ...registration,
        email: transaction.customer?.email || null,
        email_notification_status: "pending",
      });

      return jsonResponse({
        success: true,
        type: "registration",
        message: "Registration payment verified.",
        registration_number: updatedRegistration.registration_number,
      });
    }

    const { error: updateError } = await supabase
      .from("payments")
      .update({
        status: "success",
        paystack_transaction_id: String(transaction.id),
        paid_at: new Date().toISOString(),
      })
      .eq("id", payment.id)
      .eq("status", "pending");

    if (updateError) {
      throw updateError;
    }

    const { data: voteRecorded, error: voteError } = await supabase.rpc(
      "record_verified_vote",
      {
        p_payment_id: payment.id,
      },
    );

    if (voteError) {
      throw voteError;
    }

    return jsonResponse({
      success: true,
      type: "vote",
      message: voteRecorded
        ? "Payment verified and votes recorded."
        : "Payment verified. Votes were already recorded.",
      votes: payment.votes,
    });
  } catch (error) {
    console.error(error);

    return jsonResponse({
      success: false,
      message: "An unexpected error occurred.",
    }, 500);
  }
});
