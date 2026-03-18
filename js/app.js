const { createClient } = supabase;

const SUPABASE_URL = "https://ockfngovaskeppgsjesv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_W1vDg-jWPFGlsUVQgvMYUg_Cah1AG6U";

const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let currentProfileId = null;

/*
  Replace this after batch-uploading your default avatar to Vercel Blob.
  While testing locally before Blob migration, you may temporarily use:
  "resources/images/default.png"
*/
const DEFAULT_AVATAR = "resources/images/default.png";

function setStatus(message, isError = false) {
  const messageEl = document.getElementById("status-message");
  const footerEl = document.getElementById("status-bar");

  messageEl.textContent = message;
  footerEl.style.background = isError ? "#6b1a1a" : "var(--clr-status-bg)";
  footerEl.style.color = isError ? "#ffd7d7" : "var(--clr-status-text)";
}

function clearCentrePanel() {
  currentProfileId = null;

  document.getElementById("profile-pic").src = DEFAULT_AVATAR;
  document.getElementById("profile-name").textContent = "No Profile Selected";
  document.getElementById("profile-status").textContent = "—";
  document.getElementById("profile-quote").textContent = "—";
  document.getElementById("friends-list").innerHTML = "No friends to display.";

  document.querySelectorAll("#profile-list .profile-item").forEach((item) => {
    item.classList.remove("active");
  });
}

function displayProfile(profile, friendNames) {
  currentProfileId = profile.id;

  document.getElementById("profile-pic").src = profile.picture || DEFAULT_AVATAR;
  document.getElementById("profile-name").textContent = profile.name;
  document.getElementById("profile-status").textContent = profile.status?.trim() || "No status set.";
  document.getElementById("profile-quote").textContent = profile.quote?.trim() || "No quote set.";

  const friendsList = document.getElementById("friends-list");

  if (!friendNames || friendNames.length === 0) {
    friendsList.innerHTML = "No friends to display.";
    return;
  }

  friendsList.innerHTML = "";
  friendNames.forEach((name) => {
    const div = document.createElement("div");
    div.className = "friend-entry";
    div.textContent = name;
    friendsList.appendChild(div);
  });
}

function resolvePicturePath(input) {
  let value = input.trim();

  if (!value) return DEFAULT_AVATAR;

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("resources/") ||
    value.startsWith("./") ||
    value.startsWith("../")
  ) {
    return value;
  }

  if (!value.includes(".")) {
    value += ".png";
  }

  return `resources/images/${value}`;
}

async function loadProfileList() {
  try {
    const { data, error } = await db
      .from("profiles")
      .select("id, name, picture")
      .order("name", { ascending: true });

    if (error) throw error;

    const list = document.getElementById("profile-list");
    list.innerHTML = "";

    if (!data || data.length === 0) {
      list.innerHTML = `<div class="text-muted small px-2 py-2">No profiles found.</div>`;
      return;
    }

    data.forEach((profile) => {
      const item = document.createElement("div");
      item.className = "profile-item";
      item.dataset.id = profile.id;

      const img = document.createElement("img");
      img.src = profile.picture || DEFAULT_AVATAR;
      img.alt = `${profile.name} picture`;

      const name = document.createElement("span");
      name.textContent = profile.name;

      item.appendChild(img);
      item.appendChild(name);

      item.addEventListener("click", async () => {
        await selectProfile(profile.id);
      });

      list.appendChild(item);
    });
  } catch (err) {
    setStatus(`Error loading profiles: ${err.message}`, true);
  }
}

async function selectProfile(profileId) {
  try {
    document.querySelectorAll("#profile-list .profile-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.id === profileId);
    });

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("*")
      .eq("id", profileId)
      .single();

    if (profileError) throw profileError;

    const { data: friendRows, error: friendsError } = await db
      .from("friends")
      .select("profile_id, friend_id")
      .or(`profile_id.eq.${profileId},friend_id.eq.${profileId}`);

    if (friendsError) throw friendsError;

    const friendIds = friendRows.map((row) =>
      row.profile_id === profileId ? row.friend_id : row.profile_id
    );

    let friendNames = [];

    if (friendIds.length > 0) {
      const { data: friendProfiles, error: namesError } = await db
        .from("profiles")
        .select("id, name")
        .in("id", friendIds)
        .order("name", { ascending: true });

      if (namesError) throw namesError;

      friendNames = friendProfiles.map((friend) => friend.name);
    }

    displayProfile(profile, friendNames);
    setStatus(`Profile "${profile.name}" loaded.`);
  } catch (err) {
    setStatus(`Error selecting profile: ${err.message}`, true);
  }
}

async function addProfile() {
  const input = document.getElementById("input-name");
  const name = input.value.trim();

  if (!name) {
    setStatus("Error: Name field is empty. Please enter a name.", true);
    return;
  }

  try {
    const { data, error } = await db
      .from("profiles")
      .insert({
        name,
        status: "",
        quote: "",
        picture: DEFAULT_AVATAR
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        setStatus(`Error: A profile named "${name}" already exists.`, true);
      } else {
        throw error;
      }
      return;
    }

    input.value = "";
    await loadProfileList();
    await selectProfile(data.id);
    setStatus(`Profile "${name}" created successfully.`);
  } catch (err) {
    setStatus(`Error adding profile: ${err.message}`, true);
  }
}

async function lookUpProfile() {
  const query = document.getElementById("input-name").value.trim();

  if (!query) {
    setStatus("Error: Search field is empty. Please enter a name to search.", true);
    return;
  }

  try {
    const { data, error } = await db
      .from("profiles")
      .select("id, name")
      .ilike("name", `%${query}%`)
      .order("name", { ascending: true })
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      clearCentrePanel();
      setStatus(`No profile found matching "${query}".`, true);
      return;
    }

    await selectProfile(data[0].id);
  } catch (err) {
    setStatus(`Error looking up profile: ${err.message}`, true);
  }
}

async function deleteProfile() {
  if (!currentProfileId) {
    setStatus("Error: No profile is selected. Click a profile in the list first.", true);
    return;
  }

  const currentName = document.getElementById("profile-name").textContent;

  if (!window.confirm(`Delete the profile for "${currentName}"? This cannot be undone.`)) {
    setStatus("Deletion cancelled.");
    return;
  }

  try {
    const { error } = await db
      .from("profiles")
      .delete()
      .eq("id", currentProfileId);

    if (error) throw error;

    clearCentrePanel();
    await loadProfileList();
    setStatus(`Profile "${currentName}" deleted.`);
  } catch (err) {
    setStatus(`Error deleting profile: ${err.message}`, true);
  }
}

async function changeStatus() {
  if (!currentProfileId) {
    setStatus("Error: No profile is selected.", true);
    return;
  }

  const input = document.getElementById("input-status");
  const newStatus = input.value.trim();

  if (!newStatus) {
    setStatus("Error: Status field is empty.", true);
    return;
  }

  try {
    const { error } = await db
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", currentProfileId);

    if (error) throw error;

    document.getElementById("profile-status").textContent = newStatus;
    input.value = "";
    setStatus("Status updated.");
  } catch (err) {
    setStatus(`Error updating status: ${err.message}`, true);
  }
}

async function changeQuote() {
  if (!currentProfileId) {
    setStatus("Error: No profile is selected.", true);
    return;
  }

  const input = document.getElementById("input-quote");
  const newQuote = input.value.trim();

  if (!newQuote) {
    setStatus("Error: Quote field is empty.", true);
    return;
  }

  try {
    const { error } = await db
      .from("profiles")
      .update({ quote: newQuote })
      .eq("id", currentProfileId);

    if (error) throw error;

    document.getElementById("profile-quote").textContent = newQuote;
    input.value = "";
    setStatus("Quote updated.");
  } catch (err) {
    setStatus(`Error updating quote: ${err.message}`, true);
  }
}

async function changePicture() {
  if (!currentProfileId) {
    setStatus("Error: No profile is selected.", true);
    return;
  }

  const input = document.getElementById("input-picture");
  const rawPicture = input.value.trim();

  if (!rawPicture) {
    setStatus("Error: Picture field is empty.", true);
    return;
  }

  const newPicture = resolvePicturePath(rawPicture);

  try {
    const { error } = await db
      .from("profiles")
      .update({ picture: newPicture })
      .eq("id", currentProfileId);

    if (error) throw error;

    document.getElementById("profile-pic").src = newPicture;
    input.value = "";
    await loadProfileList();

    document.querySelectorAll("#profile-list .profile-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.id === currentProfileId);
    });

    setStatus("Picture updated.");
  } catch (err) {
    setStatus(`Error updating picture: ${err.message}`, true);
  }
}

function diagnoseUploadStatus(status) {
  if (status === 404) return "Upload endpoint not found. Check api/upload-avatar.js and Vercel Root Directory.";
  if (status === 413) return "File is too large.";
  if (status === 415) return "Unsupported file type. Please upload an image.";
  if (status === 500) return "Server upload function crashed.";
  return "Upload failed.";
}

async function uploadPictureFile() {
  if (!currentProfileId) {
    setStatus("Error: No profile is selected.", true);
    return;
  }

  const fileInput = document.getElementById("input-picture-file");
  const file = fileInput.files[0];

  if (!file) {
    setStatus("Error: Please choose an image file first.", true);
    return;
  }

  try {
    const formData = new FormData();
    formData.append("avatar", file);

    const response = await fetch("/api/upload-avatar", {
      method: "POST",
      body: formData
    });

    const rawText = await response.text();
    let result;

    try {
      result = JSON.parse(rawText);
    } catch {
      const preview = rawText.slice(0, 200).replace(/\s+/g, " ").trim();
      const hint = diagnoseUploadStatus(response.status);
      throw new Error(`HTTP ${response.status} (not JSON). ${hint} | Response: "${preview}"`);
    }

    if (!response.ok) {
      throw new Error(result.error || diagnoseUploadStatus(response.status));
    }

    const uploadedUrl = result.url;

    const { error } = await db
      .from("profiles")
      .update({ picture: uploadedUrl })
      .eq("id", currentProfileId);

    if (error) throw error;

    document.getElementById("profile-pic").src = uploadedUrl;
    fileInput.value = "";
    await loadProfileList();

    document.querySelectorAll("#profile-list .profile-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.id === currentProfileId);
    });

    setStatus("Picture uploaded successfully.");
  } catch (err) {
    setStatus(`Error uploading picture: ${err.message}`, true);
  }
}

function normalizeFriendPair(idA, idB) {
  return idA < idB ? [idA, idB] : [idB, idA];
}

async function addFriend() {
  if (!currentProfileId) {
    setStatus("Error: No profile is selected.", true);
    return;
  }

  const input = document.getElementById("input-friend");
  const friendName = input.value.trim();

  if (!friendName) {
    setStatus("Error: Friend name field is empty.", true);
    return;
  }

  try {
    const { data: found, error: findError } = await db
      .from("profiles")
      .select("id, name")
      .ilike("name", friendName)
      .limit(1);

    if (findError) throw findError;

    if (!found || found.length === 0) {
      setStatus(`Error: No profile named "${friendName}" exists.`, true);
      return;
    }

    const friendId = found[0].id;
    const resolvedFriendName = found[0].name;

    if (friendId === currentProfileId) {
      setStatus("Error: A profile cannot be friends with itself.", true);
      return;
    }

    const [profile_id, friend_id] = normalizeFriendPair(currentProfileId, friendId);

    const { error: insertError } = await db
      .from("friends")
      .insert({ profile_id, friend_id });

    if (insertError) {
      if (insertError.code === "23505") {
        setStatus(`"${resolvedFriendName}" is already in the friends list.`, true);
      } else {
        throw insertError;
      }
      return;
    }

    input.value = "";
    await selectProfile(currentProfileId);
    setStatus(`"${resolvedFriendName}" added as a friend.`);
  } catch (err) {
    setStatus(`Error adding friend: ${err.message}`, true);
  }
}

async function removeFriend() {
  if (!currentProfileId) {
    setStatus("Error: No profile is selected.", true);
    return;
  }

  const input = document.getElementById("input-friend");
  const friendName = input.value.trim();

  if (!friendName) {
    setStatus("Error: Friend name field is empty.", true);
    return;
  }

  try {
    const { data: found, error: findError } = await db
      .from("profiles")
      .select("id, name")
      .ilike("name", friendName)
      .limit(1);

    if (findError) throw findError;

    if (!found || found.length === 0) {
      setStatus(`Error: No profile named "${friendName}" exists.`, true);
      return;
    }

    const friendId = found[0].id;
    const resolvedFriendName = found[0].name;

    const [profile_id, friend_id] = normalizeFriendPair(currentProfileId, friendId);

    const { error: deleteError } = await db
      .from("friends")
      .delete()
      .eq("profile_id", profile_id)
      .eq("friend_id", friend_id);

    if (deleteError) throw deleteError;

    input.value = "";
    await selectProfile(currentProfileId);
    setStatus(`"${resolvedFriendName}" removed from friends list.`);
  } catch (err) {
    setStatus(`Error removing friend: ${err.message}`, true);
  }
}

function exitCurrentProfile() {
  clearCentrePanel();
  setStatus("Exited current profile.");
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("btn-add").addEventListener("click", addProfile);
  document.getElementById("btn-lookup").addEventListener("click", lookUpProfile);
  document.getElementById("btn-delete").addEventListener("click", deleteProfile);

  document.getElementById("btn-status").addEventListener("click", changeStatus);
  document.getElementById("btn-quote").addEventListener("click", changeQuote);
  document.getElementById("btn-picture").addEventListener("click", changePicture);
  document.getElementById("btn-upload-picture").addEventListener("click", uploadPictureFile);
  document.getElementById("btn-add-friend").addEventListener("click", addFriend);
  document.getElementById("btn-remove-friend").addEventListener("click", removeFriend);
  document.getElementById("btn-exit").addEventListener("click", exitCurrentProfile);

  document.getElementById("input-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addProfile();
  });

  document.getElementById("input-status").addEventListener("keydown", (e) => {
    if (e.key === "Enter") changeStatus();
  });

  document.getElementById("input-quote").addEventListener("keydown", (e) => {
    if (e.key === "Enter") changeQuote();
  });

  document.getElementById("input-picture").addEventListener("keydown", (e) => {
    if (e.key === "Enter") changePicture();
  });

  document.getElementById("input-friend").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addFriend();
  });

  await loadProfileList();
  clearCentrePanel();
  setStatus("Ready. Select a profile from the list or add a new one.");
});