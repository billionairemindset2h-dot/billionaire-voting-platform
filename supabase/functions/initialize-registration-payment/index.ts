import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY")!;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  let photoPath: string | null = null;
  try {
    const body = await req.json();

    const {
      event_id,
      name,
      age,
      sex,
      primary_contact,
      alternative_contact,
      email,
      photo_data,
    } = body;

    if (!event_id || !name || !age || !sex || !primary_contact) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Please provide all required registration details.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Get event details
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select(
        "id, name, registration_enabled, registration_price, currency, registration_end_at"
      )
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Event not found.",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Registration must be enabled
    if (!event.registration_enabled) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Registration is not available for this event.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Server-side registration deadline check
    if (
      event.registration_end_at &&
      new Date(event.registration_end_at) <= new Date()
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Registration for this event has ended.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const amount = Math.round(
      Number(event.registration_price) * 100
    );

    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Invalid registration fee.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Paystack requires an email address.
    // If the applicant does not provide one, create a unique
    // technical email address for the transaction.
    const customerEmail =
      email && String(email).trim()
        ? String(email).trim()
        : `registration-${crypto.randomUUID()}@billionairemindset.events`;

    if (photo_data) {
      if (typeof photo_data !== "string" || photo_data.length > 700000) {
        return new Response(
          JSON.stringify({ success: false, message: "The contestant photo is too large." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      let photoBytes: Uint8Array;
      try {
        photoBytes = Uint8Array.from(atob(photo_data), character => character.charCodeAt(0));
      } catch {
        return new Response(
          JSON.stringify({ success: false, message: "The contestant photo could not be processed." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (!photoBytes.length || photoBytes.length > 512 * 1024) {
        return new Response(
          JSON.stringify({ success: false, message: "The contestant photo is too large." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (photoBytes[0] !== 0xff || photoBytes[1] !== 0xd8 || photoBytes[2] !== 0xff) {
        return new Response(
          JSON.stringify({ success: false, message: "The contestant photo must be a valid JPEG image." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      photoPath = `${event_id}/${crypto.randomUUID()}.jpg`;
      const { error: photoError } = await supabase.storage
        .from("contestant-photos")
        .upload(photoPath, photoBytes, { contentType: "image/jpeg", upsert: false });
      if (photoError) {
        console.error("Contestant photo upload failed:", photoError.message);
        return new Response(
          JSON.stringify({ success: false, message: "Unable to save the contestant photo." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const callbackUrl =
      "https://billionairemindset2h-dot.github.io/billionaire-voting-platform/" +
      `?event=${encodeURIComponent(event_id)}&registration=success`;

    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: customerEmail,
          amount,
          currency: event.currency || "GHS",
          callback_url: callbackUrl,
          metadata: {
            type: "registration",
            event_id,
            event_name: event.name,
            name,
            age,
            sex,
            primary_contact,
            alternative_contact:
              alternative_contact || null,
            email: email || null,
            photo_path: photoPath,
          },
        }),
      }
    );

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      console.error("Paystack initialization failed:", paystackData);
      if (photoPath) {
        await supabase.storage.from("contestant-photos").remove([photoPath]);
      }

      return new Response(
        JSON.stringify({
          success: false,
          message:
            paystackData.message ||
            "Unable to initialize registration payment.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const registrationNumber =
      `REG-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    const { error: registrationError } = await supabase
      .from("registrations")
      .insert({
        event_id,
        registration_number: registrationNumber,
        payment_reference: paystackData.data.reference,
        amount_paid: amount / 100,
        currency: event.currency || "GHS",
        name,
        age,
        sex,
        primary_contact,
        alternative_contact: alternative_contact || null,
        photo_path: photoPath,
        status: "pending",
      });

    if (registrationError) {
      console.error("Registration record creation failed:", registrationError);
      if (photoPath) {
        await supabase.storage.from("contestant-photos").remove([photoPath]);
      }

      return new Response(
        JSON.stringify({
          success: false,
          message: "Unable to create registration record.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        reference: paystackData.data.reference,
        authorization_url: paystackData.data.authorization_url,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Registration payment error:", error);
    if (photoPath) {
      await supabase.storage.from("contestant-photos").remove([photoPath]);
    }

    return new Response(
      JSON.stringify({
        success: false,
        message: "An unexpected error occurred.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
