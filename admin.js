const SUPABASE_URL = "https://imkcouvscfsjsmpoalda.supabase.co";
const SUPABASE_KEY = "sb_publishable_Velq6YVOUWpUPJDzxL9l7A_RPKJuQGi";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentEventId = null;
let eventVisibilityColumnAvailable = true;

function isMissingVisibilityColumn(error) {
  const message = String(error?.message || "");
  return error?.code === "42703" || error?.code === "PGRST204" ||
    (/is_visible/i.test(message) && /(column|schema cache|does not exist|not found)/i.test(message));
}

async function loadDashboard() {
  let result = await db
    .from("events")
    .select("id, name, vote_price, currency, is_active, is_visible")
    .order("created_at", { ascending: false });

  if (result.error && isMissingVisibilityColumn(result.error)) {
    eventVisibilityColumnAvailable = false;
    result = await db
      .from("events")
      .select("id, name, vote_price, currency, is_active")
      .order("created_at", { ascending: false });
  }

  const { data: events, error } = result;

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
    option.textContent = `${event.name}${event.is_visible === false ? " (Hidden)" : ""}`;
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

  let eventResult = await db
    .from("events")
    .select("name, vote_price, currency, is_active, is_visible, registration_enabled, registration_price, registration_end_at")
    .eq("id", eventId)
    .single();

  if (eventResult.error && isMissingVisibilityColumn(eventResult.error)) {
    eventVisibilityColumnAvailable = false;
    eventResult = await db
      .from("events")
      .select("name, vote_price, currency, is_active, registration_enabled, registration_price, registration_end_at")
      .eq("id", eventId)
      .single();
  }

  const { data: event, error: eventError } = eventResult;

  if (eventError || !event) {
    showMessage("Unable to load the selected event settings.", true);
    return;
  }

const votingButton = document.getElementById("toggleVotingBtn");

if (votingButton) {
  votingButton.textContent = event?.is_active
    ? "VOTING OFFICIALLY OPENED"
    : "VOTING OFFICIALLY CLOSED";

  votingButton.dataset.active = String(event?.is_active);
}

  updateVisibilityButtons(event.is_visible !== false);
  updateRegistrationControls(event);
  const visibleButton = document.getElementById("setEventVisibleBtn");
  const hiddenButton = document.getElementById("setEventHiddenBtn");
  visibleButton.disabled = !eventVisibilityColumnAvailable;
  hiddenButton.disabled = !eventVisibilityColumnAvailable;
  const visibilityMessage = document.getElementById("visibilityStatusMessage");
  if (!eventVisibilityColumnAvailable) {
    visibilityMessage.textContent = "Apply the event visibility migration to enable these controls.";
    visibilityMessage.className = "message error";
    visibilityMessage.style.display = "block";
  } else {
    visibilityMessage.style.display = "none";
  }
  const eventSelect = document.getElementById("eventSelect");
  const selectedOption = eventSelect.options[eventSelect.selectedIndex];
  if (selectedOption) {
    selectedOption.textContent = `${event.name}${event.is_visible === false ? " (Hidden)" : ""}`;
  }

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
  const newName = prompt("Enter the new contestant name:");

  if (!newName || !newName.trim()) return;

  const newCode = prompt("Enter the new contestant code:");

  if (!newCode || !newCode.trim()) return;

  const message = document.getElementById("contestantMessage");

  const { error } = await db
    .from("contestants")
    .update({
      name: newName.trim(),
      code: newCode.trim()
    })
    .eq("id", contestantId);

  if (error) {
    message.textContent = "Could not update contestant: " + error.message;
    message.className = "message error";
    return;
  }

  message.textContent = "Contestant details updated successfully.";
  message.className = "message success";

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

const CONTESTANT_PHOTO_BUCKET = "contestant-photos";
const MAX_SOURCE_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_COMPRESSED_PHOTO_BYTES = 512 * 1024;
const MAX_PHOTO_EDGE = 1200;

function showContestantMessage(text, isError = false) {
  const message = document.getElementById("contestantMessage");
  message.textContent = text;
  message.className = isError ? "message error" : "message success";
  message.style.display = "block";
}

function loadPhotoImage(file) {
  if (window.createImageBitmap) return createImageBitmap(file);

  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("This image could not be opened. Try a JPEG or PNG photo."));
    };
    image.src = objectUrl;
  });
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("Could not compress this photo in the browser."));
    }, "image/jpeg", quality);
  });
}

async function compressContestantPhoto(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file for the contestant photo.");
  }
  if (file.size > MAX_SOURCE_PHOTO_BYTES) {
    throw new Error("Choose a photo smaller than 15 MB.");
  }

  let image;
  try {
    image = await loadPhotoImage(file);
    if (!image.width || !image.height || image.width * image.height > 50000000) {
      throw new Error("This photo is too large to process. Choose a smaller image.");
    }

    let scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(image.width, image.height));
    let quality = 0.82;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Photo compression is not supported by this browser.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const blob = await canvasToJpegBlob(canvas, quality);
      if (blob.size <= MAX_COMPRESSED_PHOTO_BYTES) return blob;

      if (quality > 0.62) quality -= 0.07;
      else {
        scale *= 0.82;
        quality = 0.78;
      }
    }

    throw new Error("This photo could not be compressed enough. Choose another image.");
  } finally {
    if (image && typeof image.close === "function") image.close();
  }
}

async function uploadContestantPhoto(file, eventId) {
  const compressedPhoto = await compressContestantPhoto(file);
  const randomId = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${eventId}/${randomId}.jpg`;

  const { data, error } = await db.storage
    .from(CONTESTANT_PHOTO_BUCKET)
    .upload(path, compressedPhoto, {
      cacheControl: "31536000",
      contentType: "image/jpeg",
      upsert: false
    });

  if (error) throw new Error(`Photo upload failed: ${error.message}`);

  const { data: publicUrlData } = db.storage
    .from(CONTESTANT_PHOTO_BUCKET)
    .getPublicUrl(data.path);

  return { path: data.path, publicUrl: publicUrlData.publicUrl };
}

async function removeUploadedContestantPhoto(path) {
  const { error } = await db.storage
    .from(CONTESTANT_PHOTO_BUCKET)
    .remove([path]);
  if (error) console.error("Could not remove unused contestant photo:", error);
}

function updateVisibilityButtons(isVisible) {
  const visibleButton = document.getElementById("setEventVisibleBtn");
  const hiddenButton = document.getElementById("setEventHiddenBtn");
  if (!visibleButton || !hiddenButton) return;

  visibleButton.classList.toggle("is-selected", isVisible);
  hiddenButton.classList.toggle("is-selected", !isVisible);
  visibleButton.setAttribute("aria-pressed", String(isVisible));
  hiddenButton.setAttribute("aria-pressed", String(!isVisible));
}

function toLocalDateTimeValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function updateRegistrationControls(event) {
  const isEnabled = event.registration_enabled === true;
  const toggleButton = document.getElementById("toggleRegistrationBtn");
  toggleButton.dataset.enabled = String(isEnabled);
  toggleButton.textContent = isEnabled ? "CLOSE REGISTRATION" : "OPEN REGISTRATION";
  document.getElementById("registrationPrice").value = event.registration_price ?? "";
  document.getElementById("registrationDeadline").value = toLocalDateTimeValue(event.registration_end_at);
  document.getElementById("registrationStatusMessage").style.display = "none";
  document.getElementById("registrationSettingsMessage").style.display = "none";
}

function showRegistrationMessage(elementId, text, isError = false) {
  const message = document.getElementById(elementId);
  message.textContent = text;
  message.className = isError ? "message error" : "message success";
  message.style.display = "block";
}

function readRegistrationSettings() {
  const price = Number(document.getElementById("registrationPrice").value);
  const deadlineValue = document.getElementById("registrationDeadline").value;
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Enter a registration fee greater than zero.");
  }

  const deadline = deadlineValue ? new Date(deadlineValue) : null;
  if (deadlineValue && Number.isNaN(deadline.getTime())) {
    throw new Error("Enter a valid registration deadline.");
  }

  return {
    registration_price: price,
    registration_end_at: deadline ? deadline.toISOString() : null
  };
}

document.getElementById("saveRegistrationSettingsBtn").addEventListener("click", async () => {
  if (!currentEventId) {
    showRegistrationMessage("registrationSettingsMessage", "Please select an event first.", true);
    return;
  }

  let settings;
  try {
    settings = readRegistrationSettings();
  } catch (error) {
    showRegistrationMessage("registrationSettingsMessage", error.message, true);
    return;
  }

  const saveButton = document.getElementById("saveRegistrationSettingsBtn");
  saveButton.disabled = true;
  const { error } = await db
    .from("events")
    .update(settings)
    .eq("id", currentEventId);
  saveButton.disabled = false;

  if (error) {
    showRegistrationMessage("registrationSettingsMessage", `Could not save registration settings: ${error.message}`, true);
    return;
  }

  showRegistrationMessage("registrationSettingsMessage", "Registration fee and deadline saved.");
});

document.getElementById("toggleRegistrationBtn").addEventListener("click", async () => {
  if (!currentEventId) {
    showRegistrationMessage("registrationStatusMessage", "Please select an event first.", true);
    return;
  }

  const button = document.getElementById("toggleRegistrationBtn");
  const isEnabled = button.dataset.enabled === "true";
  let update = { registration_enabled: !isEnabled };

  if (!isEnabled) {
    try {
      update = { ...readRegistrationSettings(), registration_enabled: true };
      const deadline = update.registration_end_at;
      if (deadline && new Date(deadline) <= new Date()) {
        throw new Error("Choose a future registration deadline before opening registration.");
      }
    } catch (error) {
      showRegistrationMessage("registrationStatusMessage", error.message, true);
      return;
    }
  }

  button.disabled = true;
  const eventId = currentEventId;
  const { error } = await db
    .from("events")
    .update(update)
    .eq("id", eventId);
  button.disabled = false;

  if (error) {
    showRegistrationMessage("registrationStatusMessage", `Could not change registration status: ${error.message}`, true);
    return;
  }

  button.dataset.enabled = String(!isEnabled);
  button.textContent = isEnabled ? "OPEN REGISTRATION" : "CLOSE REGISTRATION";
  showRegistrationMessage(
    "registrationStatusMessage",
    isEnabled ? "Registration is closed for this event." : "Registration is open for this event."
  );
});

async function setCurrentEventVisibility(isVisible) {
  if (!currentEventId) {
    showMessage("Please select an event first.", true);
    return;
  }
  if (!eventVisibilityColumnAvailable) {
    const visibilityMessage = document.getElementById("visibilityStatusMessage");
    visibilityMessage.textContent = "Apply the event visibility migration before changing visibility.";
    visibilityMessage.className = "message error";
    visibilityMessage.style.display = "block";
    return;
  }

  const visibleButton = document.getElementById("setEventVisibleBtn");
  const hiddenButton = document.getElementById("setEventHiddenBtn");
  const message = document.getElementById("visibilityStatusMessage");
  visibleButton.disabled = true;
  hiddenButton.disabled = true;
  message.textContent = isVisible ? "Making event visible..." : "Hiding event...";
  message.className = "message";
  message.style.display = "block";

  const { error } = await db
    .from("events")
    .update({ is_visible: isVisible })
    .eq("id", currentEventId);

  visibleButton.disabled = false;
  hiddenButton.disabled = false;

  if (error) {
    message.textContent = "Could not change event visibility: " + error.message;
    message.className = "message error";
    return;
  }

  updateVisibilityButtons(isVisible);
  const eventSelect = document.getElementById("eventSelect");
  const selectedOption = eventSelect.options[eventSelect.selectedIndex];
  if (selectedOption) {
    const eventName = selectedOption.textContent.replace(/ \(Hidden\)$/, "");
    selectedOption.textContent = `${eventName}${isVisible ? "" : " (Hidden)"}`;
  }

  message.textContent = isVisible
    ? "This event is visible on the public voting page."
    : "This event is hidden from the public voting page.";
  message.className = "message success";
}

document.getElementById("setEventVisibleBtn").addEventListener("click", () => {
  setCurrentEventVisibility(true);
});

document.getElementById("setEventHiddenBtn").addEventListener("click", () => {
  setCurrentEventVisibility(false);
});

document
  .getElementById("eventSelect")
  .addEventListener("change", event => {
    loadEventData(event.target.value);
  });

loadDashboard();
document
  .getElementById("toggleVotingBtn")
  .addEventListener("click", async () => {
    if (!currentEventId) {
      showMessage("Please select an event first.", true);
      return;
    }

    const button = document.getElementById("toggleVotingBtn");
    const currentStatus = button.dataset.active === "true";
    const newStatus = !currentStatus;

    const { error } = await db
      .from("events")
      .update({ is_active: newStatus })
      .eq("id", currentEventId);

    if (error) {
      showMessage("Could not change voting status: " + error.message, true);
      return;
    }

    button.textContent = newStatus
      ? "VOTING OFFICIALLY OPENED"
      : "VOTING OFFICIALLY CLOSED";

    button.dataset.active = String(newStatus);

    const statusMessage = document.getElementById("votingStatusMessage");

    if (statusMessage) {
      statusMessage.textContent = newStatus
        ? "VOTING OFFICIALLY OPENED"
        : "VOTING OFFICIALLY CLOSED";

      statusMessage.className = newStatus
        ? "message success"
        : "message";
    }
  });
document
  .getElementById("copyVotingLinkBtn")
  .addEventListener("click", async () => {
    if (!currentEventId) {
      showMessage("Please select an event first.", true);
      return;
    }

    const votingLink =
      `${window.location.origin}${window.location.pathname.replace("admin.html", "index.html")}?event=${currentEventId}`;

    try {
      await navigator.clipboard.writeText(votingLink);
      showMessage("Voting link copied successfully.", false);
    } catch (error) {
      showMessage("Could not copy the voting link.", true);
    }
  });

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
      is_active: true,
      registration_enabled: false,
      registration_price: 0,
      registration_end_at: null
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
let contestantPhotoPreviewUrl = null;

document.getElementById("newContestantPhoto").addEventListener("change", event => {
  const file = event.target.files[0];
  const preview = document.getElementById("contestantPhotoPreview");
  const previewImage = document.getElementById("contestantPhotoPreviewImage");

  if (contestantPhotoPreviewUrl) {
    URL.revokeObjectURL(contestantPhotoPreviewUrl);
    contestantPhotoPreviewUrl = null;
  }
  preview.style.display = "none";
  previewImage.removeAttribute("src");

  if (!file) return;
  if (!file.type.startsWith("image/")) {
    event.target.value = "";
    showContestantMessage("Choose an image file for the contestant photo.", true);
    return;
  }
  if (file.size > MAX_SOURCE_PHOTO_BYTES) {
    event.target.value = "";
    showContestantMessage("Choose a photo smaller than 15 MB.", true);
    return;
  }

  contestantPhotoPreviewUrl = URL.createObjectURL(file);
  previewImage.src = contestantPhotoPreviewUrl;
  preview.style.display = "block";
  showContestantMessage(`Photo selected (${(file.size / 1024 / 1024).toFixed(1)} MB before compression).`);
});

document.getElementById("createContestantBtn").addEventListener("click", async () => {
  const nameInput = document.getElementById("newContestantName");
  const codeInput = document.getElementById("newContestantCode");
  const photoInput = document.getElementById("newContestantPhoto");
  const createButton = document.getElementById("createContestantBtn");
  const eventSelect = document.getElementById("eventSelect");
  const name = nameInput.value.trim();
  const code = codeInput.value.trim();
  const photoFile = photoInput.files[0] || null;
  const eventId = currentEventId;
  let uploadedPhotoPath = null;

  if (!eventId) {
    showContestantMessage("Please select an event first.", true);
    return;
  }
  if (!name) {
    showContestantMessage("Please enter a contestant name.", true);
    return;
  }
  if (!code) {
    showContestantMessage("Please enter a contestant code.", true);
    return;
  }

  createButton.disabled = true;
  eventSelect.disabled = true;
  nameInput.disabled = true;
  codeInput.disabled = true;
  photoInput.disabled = true;

  try {
    let photoUrl = "";
    if (photoFile) {
      createButton.textContent = "RESIZING AND UPLOADING PHOTO...";
      showContestantMessage("Compressing the selected photo for this event...");
      const uploadedPhoto = await uploadContestantPhoto(photoFile, eventId);
      uploadedPhotoPath = uploadedPhoto.path;
      photoUrl = uploadedPhoto.publicUrl;
    }

    createButton.textContent = "SAVING CONTESTANT...";
    const { error } = await db
      .from("contestants")
      .insert([{
        event_id: eventId,
        name,
        code,
        photo_url: photoUrl,
        vote_count: 0,
        is_active: true
      }]);

    if (error) throw new Error(`Could not create contestant: ${error.message}`);

    if (contestantPhotoPreviewUrl) {
      URL.revokeObjectURL(contestantPhotoPreviewUrl);
      contestantPhotoPreviewUrl = null;
    }
    nameInput.value = "";
    codeInput.value = "";
    photoInput.value = "";
    document.getElementById("contestantPhotoPreview").style.display = "none";
    document.getElementById("contestantPhotoPreviewImage").removeAttribute("src");

    await loadEventData(eventId);
    showContestantMessage("Contestant created successfully.");
  } catch (error) {
    if (uploadedPhotoPath) await removeUploadedContestantPhoto(uploadedPhotoPath);
    showContestantMessage(error.message || "Could not create contestant.", true);
  } finally {
    createButton.disabled = false;
    createButton.textContent = "CREATE CONTESTANT";
    eventSelect.disabled = false;
    nameInput.disabled = false;
    codeInput.disabled = false;
    photoInput.disabled = false;
  }
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
