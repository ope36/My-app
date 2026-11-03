
// ==========================================
// HUSH — app.js (Part 1/2) — FINAL v2
// ==========================================

// ═══════════════════════════════
// DOM References
// ═══════════════════════════════

const feedSection = document.getElementById("feed");
const writeSection = document.getElementById("write");
const profileSection = document.getElementById("profile");
const userProfileSection = document.getElementById("userProfile");
const roomsSection = document.getElementById("rooms");
const roomChatSection = document.getElementById("roomChat");

const navFeed = document.getElementById("navFeed");
const navRooms = document.getElementById("navRooms");
const navProfile = document.getElementById("navProfile");
const fabWrite = document.getElementById("fabWrite");

const whisperInput = document.getElementById("whisperInput");
const charCount = document.getElementById("charCount");
const publishBtn = document.getElementById("publishBtn");

const commentsModal = document.getElementById("commentsModal");
const closeComments = document.getElementById("closeComments");
const commentsList = document.getElementById("commentsList");
const commentInput = document.getElementById("commentInput");
const sendComment = document.getElementById("sendComment");

const createRoomBtn = document.getElementById("createRoomBtn");
const roomsConditionMsg = document.getElementById("roomsConditionMsg");
const roomsList = document.getElementById("roomsList");
const roomChatTitle = document.getElementById("roomChatTitle");
const roomChatMembersCount = document.getElementById("roomChatMembersCount");
const roomChatMessages = document.getElementById("roomChatMessages");
const roomChatInput = document.getElementById("roomChatInput");
const sendRoomMessageBtn = document.getElementById("sendRoomMessageBtn");
const backToRoomsBtn = document.getElementById("backToRoomsBtn");
const roomMembersBtn = document.getElementById("roomMembersBtn");
const roomMembersModal = document.getElementById("roomMembersModal");
const closeRoomMembers = document.getElementById("closeRoomMembers");
const roomMembersList = document.getElementById("roomMembersList");
const confirmLeaveRoomBtn = document.getElementById("confirmLeaveRoomBtn");

const joinRoomModal = document.getElementById("joinRoomModal");
const joinRoomModalText = document.getElementById("joinRoomModalText");
const cancelJoinRoom = document.getElementById("cancelJoinRoom");
const confirmJoinRoom = document.getElementById("confirmJoinRoom");

const createRoomModal = document.getElementById("createRoomModal");
const createRoomName = document.getElementById("createRoomName");
const cancelCreateRoom = document.getElementById("cancelCreateRoom");
const confirmCreateRoom = document.getElementById("confirmCreateRoom");

// ═══════════════════════════════
// State
// ═══════════════════════════════

let currentWhisperId = null;
let currentProfileId = null;
let currentRoute = null;
let currentRoomId = null;
let roomChatInterval = null;
let pendingRoomId = null;

// ═══════════════════════════════
// Blue Dot — بدل الإشعارات
// ═══════════════════════════════

const LAST_SEEN_KEY = "hush_last_seen_whisper_id";

function getLastSeenWhisperId() {
  const raw = localStorage.getItem(LAST_SEEN_KEY);
  const id = parseInt(raw, 10);
  return isNaN(id) ? 0 : id;
}

function setLastSeenWhisperId(id) {
  if (!id) return;
  localStorage.setItem(LAST_SEEN_KEY, String(id));
}

async function hasUnreadWhispers() {
  const lastSeen = getLastSeenWhisperId();
  try {
    const { data } = await supabaseClient
      .from("whispers")
      .select("id")
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return false;

    if (lastSeen === 0) {
      setLastSeenWhisperId(data.id);
      return false;
    }
    return data.id > lastSeen;
  } catch (err) {
    return false;
  }
}

async function updateBlueDot() {
  if (!navFeed) return;
  try {
    const unread = await hasUnreadWhispers();
    navFeed.classList.toggle("has-dot", unread);
  } catch (err) {
    console.error('[updateBlueDot]', err);
  }
}

// ═══════════════════════════════
// Avatar
// ═══════════════════════════════

const AVATAR_COLORS = [
  "#007AFF", "#AF52DE", "#FF2D55", "#34C759", "#FF9500",
  "#FF3B30", "#FFCC00", "#5AC8FA", "#8E8E93", "#FFD60A"
];

function getAvatarData(userId, username) {
  const seed = (userId || "").slice(0, 8);
  let num = 0;
  for (let i = 0; i < seed.length; i++) {
    num += seed.charCodeAt(i);
  }
  const color = AVATAR_COLORS[num % AVATAR_COLORS.length];
  const letter = (username || "A").charAt(0).toUpperCase();
  return { letter, color };
}

window.getAvatarData = getAvatarData;

// ═══════════════════════════════
// Sections & Nav
// ═══════════════════════════════

function showSection(section) {
  [feedSection, writeSection, profileSection, userProfileSection, roomsSection, roomChatSection].forEach(sec => {
    if (sec) sec.hidden = true;
  });
  if (section) section.hidden = false;
}

function setActiveNav(name) {
  [navFeed, navRooms, navProfile].forEach(nav => {
    if (nav) nav.classList.remove("active");
  });
  if (name === "feed" && navFeed) navFeed.classList.add("active");
  if (name === "rooms" && navRooms) navRooms.classList.add("active");
  if (name === "profile" && navProfile) navProfile.classList.add("active");
}

function navigate(route) {
  if (currentRoute === route) return;
  currentRoute = route;
  window.location.hash = route;
}

window.addEventListener("hashchange", () => {
  handleRoute();
});

// ═══════════════════════════════
// Router
// ═══════════════════════════════

async function handleRoute() {
  const myId = getCachedUserId();
  if (!myId) return;

  const hash = (window.location.hash || "").slice(1) || "feed";
  const parts = hash.split("/");

  // تنظيف room polling إذا خرجنا من الغرفة
  if (currentRoomId && !(parts[0] === "room" && parts[1] === currentRoomId)) {
    if (roomChatInterval) {
      clearInterval(roomChatInterval);
      roomChatInterval = null;
    }
    currentRoomId = null;
  }

  if (parts[0] === "feed" || hash === "") {
    showSection(feedSection);
    setActiveNav("feed");
    fabWrite.hidden = false;

    // 🔥 ما نعيد التحميل إذا الـ feed فيه همسات معروضة
    if (!feedSection.querySelector(".whisper")) {
      await loadWhispers();
    }

    // تحديث lastSeen + إزالة النقطة الزرقاء
    const latest = document.querySelector("#feed .whisper");
    if (latest) {
      const firstWhisperId = latest.dataset.whisperId;
      if (firstWhisperId) setLastSeenWhisperId(parseInt(firstWhisperId, 10));
    }
    if (navFeed) navFeed.classList.remove("has-dot");

  } else if (parts[0] === "rooms") {
    showSection(roomsSection);
    setActiveNav("rooms");
    fabWrite.hidden = true;
    await loadRoomsPage();

  } else if (parts[0] === "room" && parts[1]) {
    currentRoomId = parts[1];
    showSection(roomChatSection);
    setActiveNav("rooms");
    fabWrite.hidden = true;
    await loadRoomChat(parts[1]);

  } else if (parts[0] === "write") {
    showSection(writeSection);
    setActiveNav(null);
    fabWrite.hidden = true;

  } else if (parts[0] === "me") {
    showSection(profileSection);
    setActiveNav("profile");
    fabWrite.hidden = false;
    // ⚡ بدون await — الشاشة تظهر فوراً
    if (typeof loadProfile === "function") loadProfile();

  } else if (parts[0] === "user" && parts[1]) {
    fabWrite.hidden = false;
    await openUserProfile(parts[1]);
  }
}

if (navFeed) navFeed.addEventListener("click", () => navigate("feed"));
if (navRooms) navRooms.addEventListener("click", () => navigate("rooms"));
if (navProfile) navProfile.addEventListener("click", () => navigate("me"));
if (fabWrite) fabWrite.addEventListener("click", () => navigate("write"));

// ═══════════════════════════════
// Write / Publish
// ═══════════════════════════════

if (whisperInput) {
  whisperInput.addEventListener("input", () => {
    const length = whisperInput.value.length;
    if (charCount) charCount.textContent = `${length} / 700`;
  });
}

if (publishBtn) {
  publishBtn.addEventListener("click", async () => {
    const text = whisperInput.value.trim();
    if (text === "") return;

    publishBtn.disabled = true;

    const localCheck = containsHardBlock(text);
    if (localCheck.blocked) {
      publishBtn.disabled = false;
      if (localCheck.reason === "self_harm") showCrisisModal(true);
      else if (localCheck.reason === "sexual") showBlockedNotice("المحتوى الجنسي غير مسموح");
      else if (localCheck.reason === "violence") showBlockedNotice("المحتوى غير مسموح");
      return;
    }

    let aiCheck = { level: 1 };
    try {
      aiCheck = await moderateContent(text);
    } catch (e) {}

    if (aiCheck.level === 3) {
      publishBtn.disabled = false;
      showCrisisModal(true);
      return;
    }

    const result = await createWhisper(text);

    if (result && result.blocked) {
  publishBtn.disabled = false;
  if (result.reason === "self_harm" || result.reason === "harmful_content") {
    showCrisisModal(true); // رسالة الدعم النفسي
  } else {
    showBlockedNotice("This content violates our safety policy.");
  }
  return;
}
    if (result && result.data) {
      whisperInput.value = "";
      if (charCount) charCount.textContent = "0 / 700";
      currentRoute = null;
      // 🔥 نمسح الـ feed عشان نعيد تحميله بالهمسة الجديدة
      if (feedSection) feedSection.innerHTML = "";
      navigate("feed");
      if (typeof loadProfile === "function") loadProfile();
      if (aiCheck.level === 2) showGentleNotice();
    } else {
      showBlockedNotice("حدث خطأ، حاول مرة أخرى");
    }

    publishBtn.disabled = false;
  });
}

// ═══════════════════════════════
// Notices & Modals
// ═══════════════════════════════

function showGentleNotice() {
  const existing = document.getElementById("gentleNotice");
  if (existing) existing.remove();
  const notice = document.createElement("div");
  notice.id = "gentleNotice";
  notice.className = "gentle-notice";
  notice.innerHTML = `<p>❤️ نحن معك</p><p class="notice-small">إذا كنت بتحس بشي صعب، ما إنت لحالك.</p>`;
  document.body.appendChild(notice);
  setTimeout(() => {
    notice.style.opacity = "0";
    setTimeout(() => notice.remove(), 300);
  }, 5000);
}

function showCrisisModal(blocked = false) {
  const existing = document.getElementById("crisisModal");
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.id = "crisisModal";
  modal.className = "crisis-modal";
  modal.innerHTML = `
    <div class="crisis-content">
      <h3>❤️ أنت مو لحالك</h3>
      <p>نحن نهتم فيك. من فضلك، احكي مع حد تثق فيه.</p>
      ${blocked ? '<p class="blocked-text">لم يتم نشر الهمسة لحمايتك.</p>' : ''}
      <div class="crisis-actions">
        <button class="crisis-btn primary" id="crisisClose">حسناً، شكراً</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById("crisisClose").addEventListener("click", () => modal.remove());
}

function showBlockedNotice(message) {
  const notice = document.createElement("div");
  notice.className = "gentle-notice";
  notice.innerHTML = `<p>⚠️ ${message}</p>`;
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), 4000);
}

// ═══════════════════════════════
// Helpers
// ═══════════════════════════════

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h";
  const days = Math.floor(hours / 24);
  if (days < 7) return days + "d";
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return weeks + "w";
  const months = Math.floor(days / 30);
  if (months < 12) return months + "mo";
  return Math.floor(days / 365) + "y";
}

function renderTextWithMentions(escapedText, mentions) {
  let result = escapedText;
  mentions.forEach(m => {
    const regex = new RegExp(`@${m.username}\\b`, "g");
    result = result.replace(regex, `<a class="mention" data-user-id="${m.id}">@${m.username}</a>`);
  });
  return result;
}

async function processMentions() {
  const commentTexts = document.querySelectorAll(".comment-text[data-raw]");
  for (const el of commentTexts) {
    const text = el.dataset.raw;
    const mentions = await findMentions(text);
    if (mentions.length > 0) {
      el.innerHTML = renderTextWithMentions(escapeHtml(text), mentions);
    }
    el.removeAttribute("data-raw");
  }
  document.querySelectorAll(".mention").forEach(el => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigate("user/" + el.dataset.userId);
    });
  });
}

// ═══════════════════════════════
// Feed / Whispers
// ═══════════════════════════════

async function loadWhispers() {
  const whispers = await getWhispers();
  const myId = getCachedUserId();

  // حماية: إذا فشل الطلب، ما نمسح القديم
  if (!Array.isArray(whispers)) return;

  if (!feedSection) return;
  feedSection.innerHTML = "";

  if (whispers.length === 0) {
    feedSection.innerHTML = '<p class="empty-feed">No whispers yet. Be the first.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  whispers.forEach(whisper => {
    const article = createWhisperElement(whisper, myId);
    fragment.appendChild(article);
    attachWhisperListeners(article, whisper);
  });
  feedSection.appendChild(fragment);
}

function createWhisperElement(whisper, myId) {
  const article = document.createElement("article");
  article.className = "whisper";
  article.dataset.whisperId = whisper.id;

  const username = whisper.profiles?.username || "Anonymous";
  const userId = whisper.user_id;
  const isMe = myId === userId;
  const likeCount = whisper.likes_count || 0;
  const commentCount = whisper.comments_count || 0;
  const avatar = getAvatarData(userId, username);

  article.innerHTML = `
    <div class="whisper-header">
      <div class="avatar clickable" data-user-id="${userId}" style="background:${avatar.color}">${avatar.letter}</div>
      <div class="meta">
        <span class="name clickable" data-user-id="${userId}">${escapeHtml(username)}</span>
        <span class="dot">·</span>
        <span class="time">${timeAgo(whisper.created_at)}</span>
        ${!isMe ? `<button class="follow-btn ${whisper.isFollowing ? "following" : ""}" data-user-id="${userId}">${whisper.isFollowing ? "Following" : "Follow"}</button>` : ""}
      </div>
    </div>
    <p class="whisper-text">${escapeHtml(whisper.content)}</p>
    <div class="whisper-actions">
      <button class="action-btn like-btn ${whisper.isLikedByMe ? 'liked' : ''}" data-whisper-id="${whisper.id}" aria-label="Like">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        <span>${likeCount}</span>
      </button>
      <button class="action-btn comment-btn" data-whisper-id="${whisper.id}" aria-label="Comment">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        <span>${commentCount}</span>
      </button>
    </div>
  `;
  return article;
}

function attachWhisperListeners(article, whisper) {
  // ---------- Like (بدون Optimistic UI — لا جلتش) ----------
  const likeBtn = article.querySelector(".like-btn");
  if (likeBtn) {
    likeBtn.addEventListener("click", async () => {
      if (likeBtn.disabled) return;
      likeBtn.disabled = true;

      const whisperId = parseInt(likeBtn.dataset.whisperId);
      const res = await toggleLike(whisperId);

      // نحدّث UI بس بعد تأكيد السيرفر
      if (res && res.success) {
        const countSpan = likeBtn.querySelector("span");
        if (countSpan) countSpan.textContent = res.newCount;
        likeBtn.classList.toggle("liked", res.newIsLiked);
      }

      likeBtn.disabled = false;
    });
  }

  // ---------- Comment ----------
  const commentBtn = article.querySelector(".comment-btn");
  if (commentBtn) {
    commentBtn.addEventListener("click", () => {
      const whisperId = parseInt(commentBtn.dataset.whisperId);
      openComments(whisperId);
    });
  }

  // ---------- Follow ----------
  const followBtn = article.querySelector(".follow-btn");
  if (followBtn) {
    followBtn.addEventListener("click", async () => {
      const userId = followBtn.dataset.userId;
      const result = await toggleFollow(userId);
      if (result) {
        const allBtns = document.querySelectorAll(`.follow-btn[data-user-id="${userId}"]`);
        allBtns.forEach(btn => {
          if (result.action === "followed") {
            btn.textContent = "Following";
            btn.classList.add("following");
          } else {
            btn.textContent = "Follow";
            btn.classList.remove("following");
          }
        });
        if (typeof loadProfile === "function") loadProfile();
      }
    });
  }

  // ---------- Clickable (avatar + name) ----------
  article.querySelectorAll(".clickable").forEach(el => {
    el.addEventListener("click", () => {
      const userId = el.dataset.userId;
      if (userId) navigate("user/" + userId);
    });
  });
}

window.createWhisperElement = createWhisperElement;
window.attachWhisperListeners = attachWhisperListeners;
// ==========================================
// HUSH — app.js (Part 2/2) — FINAL v2
// ==========================================

// ═══════════════════════════════
// Rooms — Page
// ═══════════════════════════════

async function loadRoomsPage() {
  const myId = getCachedUserId();
  const check = await canCreateRoom(myId);

  if (check.canCreate) {
    if (createRoomBtn) createRoomBtn.hidden = false;
    if (roomsConditionMsg) roomsConditionMsg.hidden = true;
  } else {
    if (createRoomBtn) createRoomBtn.hidden = true;
    if (roomsConditionMsg) {
      roomsConditionMsg.hidden = false;
      if (check.reason) roomsConditionMsg.textContent = "🔒 " + check.reason;
    }
  }

  const rooms = await getRooms();
  if (roomsList) roomsList.innerHTML = "";

  if (rooms.length === 0) {
    if (roomsList) roomsList.innerHTML = '<p class="empty-feed">No active rooms. Be the first to create one!</p>';
    return;
  }

  const fragment = document.createDocumentFragment();

  rooms.forEach(room => {
    const isFull = room.membersCount >= room.max_members;
    const iAmMember = room.room_members?.some(m => m.user_id === myId);

    const div = document.createElement("div");
    div.className = "room-card";

    let statusClass = "open";
    let statusText = "Open";
    if (iAmMember) { statusClass = "joined"; statusText = "Joined"; }
    else if (isFull) { statusClass = "full"; statusText = "Full"; }

    div.innerHTML = `
      <div class="room-card-info">
        <h3>${escapeHtml(room.name)}</h3>
        <p>${room.membersCount} / ${room.max_members} Members</p>
      </div>
      <div class="room-card-status ${statusClass}">${statusText}</div>
    `;

    div.addEventListener("click", async () => {
      if (iAmMember) {
        navigate("room/" + room.id);
      } else {
        const currentRoomCheck = await getMyCurrentRoom();
        if (currentRoomCheck) {
          showBlockedNotice(`You are already in "${currentRoomCheck.name}". Please leave it first.`);
        } else if (isFull) {
          showBlockedNotice("This room is full.");
        } else {
          pendingRoomId = room.id;
          if (joinRoomModalText) joinRoomModalText.textContent = `Do you want to join "${room.name}"?`;
          if (joinRoomModal) joinRoomModal.hidden = false;
        }
      }
    });

    fragment.appendChild(div);
  });

  if (roomsList) roomsList.appendChild(fragment);
}

async function joinAndEnterRoom(roomId) {
  const isMember = await amIMember(roomId);
  if (!isMember) {
    const res = await joinRoom(roomId);
    if (res && res.error) {
      showBlockedNotice(res.error);
      return;
    }
  }
  navigate("room/" + roomId);
}

// ---------- Create Room ----------

if (createRoomBtn) {
  createRoomBtn.addEventListener("click", async () => {
    const myId = getCachedUserId();
    const check = await canCreateRoom(myId);
    const currentRoomCheck = await getMyCurrentRoom();

    if (currentRoomCheck) {
      showBlockedNotice(`You are already in "${currentRoomCheck.name}". Please leave it first.`);
      return;
    }

    if (!check.canCreate) {
      showBlockedNotice(check.reason || "You cannot create a room right now.");
      return;
    }

    if (createRoomName) createRoomName.value = "";
    if (createRoomModal) createRoomModal.hidden = false;
    if (createRoomName) createRoomName.focus();
  });
}

if (cancelCreateRoom) {
  cancelCreateRoom.addEventListener("click", () => {
    if (createRoomModal) createRoomModal.hidden = true;
  });
}

if (confirmCreateRoom) {
  confirmCreateRoom.addEventListener("click", async () => {
    const name = createRoomName.value.trim();
    if (name === "") return;

    confirmCreateRoom.disabled = true;
    const room = await createRoom(name);

    if (room) {
      if (createRoomModal) createRoomModal.hidden = true;
      await joinAndEnterRoom(room.id);
    } else {
      showBlockedNotice("Failed to create room. You might already be in one.");
    }
    confirmCreateRoom.disabled = false;
  });
}

// ---------- Join Room ----------

if (cancelJoinRoom) {
  cancelJoinRoom.addEventListener("click", () => {
    if (joinRoomModal) joinRoomModal.hidden = true;
    pendingRoomId = null;
  });
}

if (confirmJoinRoom) {
  confirmJoinRoom.addEventListener("click", async () => {
    if (!pendingRoomId) return;
    if (joinRoomModal) joinRoomModal.hidden = true;
    await joinAndEnterRoom(pendingRoomId);
    pendingRoomId = null;
  });
}

// ---------- Room Chat ----------

async function loadRoomChat(roomId) {
  const rooms = await getRooms();
  const room = rooms.find(r => String(r.id) === String(roomId));

  if (!room) {
    showBlockedNotice("Room not found or deleted");
    navigate("rooms");
    return;
  }

  if (roomChatTitle) roomChatTitle.textContent = room.name;
  if (roomChatMembersCount) roomChatMembersCount.textContent = `${room.membersCount} Active`;

  await refreshRoomMessages(roomId);

  if (roomChatInterval) clearInterval(roomChatInterval);

  // polling أخف: 5 ثواني، رسائل بس
  roomChatInterval = setInterval(async () => {
    await refreshRoomMessages(roomId);
  }, 5000);
}

async function refreshRoomMessages(roomId) {
  try {
    const messages = await getRoomMessages(roomId);
    const myId = getCachedUserId();

    if (!roomChatMessages) return;

    // حماية: نفس العدد → ما نمسح ونعيد (يمنع الوميض)
    const currentCount = roomChatMessages.querySelectorAll(".room-message").length;
    if (messages.length === currentCount && currentCount > 0) return;

    roomChatMessages.innerHTML = "";

    const fragment = document.createDocumentFragment();
    messages.forEach(msg => {
      const isMe = myId && msg.user_id === myId;
      const avatar = getAvatarData(msg.user_id, msg.profiles?.username);
      const div = document.createElement("div");
      div.className = `room-message ${isMe ? "mine" : ""}`;
      div.innerHTML = `
        <div class="avatar" style="background:${avatar.color}">${avatar.letter}</div>
        <div class="room-message-content">
          <div class="room-message-name">${escapeHtml(msg.profiles?.username || "Anonymous")}</div>
          <div class="room-message-text">${escapeHtml(msg.content)}</div>
        </div>
      `;
      fragment.appendChild(div);
    });

    roomChatMessages.appendChild(fragment);
    roomChatMessages.scrollTop = roomChatMessages.scrollHeight;
  } catch (err) {
    console.error("Error refreshing room messages:", err);
  }
}

if (sendRoomMessageBtn) {
  sendRoomMessageBtn.addEventListener("click", async () => {
    const text = roomChatInput.value.trim();
    if (!text || !currentRoomId) return;

    const localCheck = containsHardBlock(text);
    if (localCheck.blocked) {
      showBlockedNotice("الرسالة تحتوي على محتوى غير مسموح.");
      return;
    }

    roomChatInput.value = "";
    const res = await sendRoomMessage(currentRoomId, text);
    if (res) {
      await refreshRoomMessages(currentRoomId);
    } else {
      showBlockedNotice("تعذر إرسال الرسالة.");
      roomChatInput.value = text;
    }
  });
}

if (roomChatInput) {
  roomChatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && sendRoomMessageBtn) sendRoomMessageBtn.click();
  });
}

if (roomMembersBtn) {
  roomMembersBtn.addEventListener("click", async () => {
    if (!currentRoomId) return;
    if (roomMembersModal) roomMembersModal.hidden = false;
    if (roomMembersList) roomMembersList.innerHTML = '<p style="text-align:center;">Loading...</p>';

    const members = await getRoomMembers(currentRoomId);
    if (roomMembersList) roomMembersList.innerHTML = "";
    const myId = getCachedUserId();

    members.forEach(m => {
      const username = m.profiles?.username || "Anonymous";
      const avatar = getAvatarData(m.user_id, username);
      const isMe = m.user_id === myId;

      const div = document.createElement("div");
      div.className = "room-member-item";
      div.innerHTML = `
        <div class="avatar" style="background:${avatar.color}">${avatar.letter}</div>
        <div class="name">${escapeHtml(username)} ${isMe ? '(You)' : ''}</div>
      `;
      if (!isMe) {
        div.addEventListener("click", () => {
          if (roomMembersModal) roomMembersModal.hidden = true;
          navigate("user/" + m.user_id);
        });
      }
      if (roomMembersList) roomMembersList.appendChild(div);
    });
  });
}

if (closeRoomMembers) {
  closeRoomMembers.addEventListener("click", () => {
    if (roomMembersModal) roomMembersModal.hidden = true;
  });
}

if (backToRoomsBtn) {
  backToRoomsBtn.addEventListener("click", () => {
    navigate("rooms");
  });
}

if (confirmLeaveRoomBtn) {
  confirmLeaveRoomBtn.addEventListener("click", async () => {
    if (!currentRoomId) return;

    // 1. نغير شكل الزر عشان المستخدم يعرف إنو عم يحمل
    confirmLeaveRoomBtn.disabled = true;
    confirmLeaveRoomBtn.textContent = 'Leaving...';

    // 2. نوقف الـ Interval تبع تحديث الرسائل
    if (roomChatInterval) {
      clearInterval(roomChatInterval);
      roomChatInterval = null;
    }

    // 3. ننفذ المغادرة من السيرفر
    await leaveRoom(currentRoomId);
    currentRoomId = null;
    
    // 4. نسكر المودال ونرجع للغرف
    if (roomMembersModal) roomMembersModal.hidden = true;
    
    // 5. نصفر الزر (عشان لو رجع دخل غرفة تانية)
    confirmLeaveRoomBtn.disabled = false;
    confirmLeaveRoomBtn.textContent = 'Leave Room';
    
    navigate("rooms");
  });
}

// ═══════════════════════════════
// User Profile
// ═══════════════════════════════

async function openUserProfile(userId) {
  if (!userId) return;
  const myId = getCachedUserId();
  if (userId === myId) {
    currentRoute = null;
    navigate("me");
    return;
  }

  currentProfileId = userId;
  showSection(userProfileSection);
  setActiveNav(null);

  const [profile, stats, whispers] = await Promise.all([
    getUserProfile(userId),
    getUserStats(userId),
    getUserWhispers(userId)
  ]);

  if (!profile) {
    if (userProfileSection) userProfileSection.innerHTML = '<p class="empty-feed">User not found.</p>';
    return;
  }

  const username = profile.username || "Anonymous";
  const avatar = getAvatarData(userId, username);

  const uAvatar = document.getElementById("userProfileAvatar");
  const uUsername = document.getElementById("userProfileUsername");
  if (uAvatar) {
    uAvatar.style.background = avatar.color;
    uAvatar.textContent = avatar.letter;
  }
  if (uUsername) uUsername.textContent = username;

  const joinedEl = document.getElementById("userProfileJoined");
  if (profile.created_at && joinedEl) {
    const date = new Date(profile.created_at);
    joinedEl.textContent = "Joined " + date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  const sWhispers = document.getElementById("userStatWhispers");
  const sHearts = document.getElementById("userStatHearts");
  const sFollowers = document.getElementById("userStatFollowers");
  const sFollowing = document.getElementById("userStatFollowing");
  if (sWhispers) sWhispers.textContent = stats.whispers;
  if (sHearts) sHearts.textContent = stats.hearts;
  if (sFollowers) sFollowers.textContent = stats.followers;
  if (sFollowing) sFollowing.textContent = stats.following;

  const followBtn = document.getElementById("userFollowBtn");
  const following = await isFollowing(userId);

  if (followBtn) {
    if (following) {
      followBtn.textContent = "Following";
      followBtn.classList.add("following");
    } else {
      followBtn.textContent = "Follow";
      followBtn.classList.remove("following");
    }

    followBtn.onclick = async () => {
      const result = await toggleFollow(userId);
      if (result) {
        if (result.action === "followed") {
          followBtn.textContent = "Following";
          followBtn.classList.add("following");
        } else {
          followBtn.textContent = "Follow";
          followBtn.classList.remove("following");
        }
        const newStats = await getUserStats(userId);
        if (sFollowers) sFollowers.textContent = newStats.followers;
      }
    };
  }

  const container = document.getElementById("userWhispers");
  if (container) {
    container.innerHTML = "";
    if (whispers.length === 0) {
      container.innerHTML = '<p class="empty-feed">No whispers yet.</p>';
    } else {
      whispers.forEach(w => {
        const article = createWhisperElement(w, myId);
        container.appendChild(article);
        attachWhisperListeners(article, w);
      });
    }
  }
}

// ═══════════════════════════════
// Comments
// ═══════════════════════════════

async function openComments(whisperId) {
  currentWhisperId = whisperId;
  if (commentsModal) commentsModal.hidden = false;
  await loadComments();
}

async function loadComments() {
  const comments = await getComments(currentWhisperId);
  if (!commentsList) return;
  commentsList.innerHTML = "";

  if (comments.length === 0) {
    commentsList.innerHTML = '<p class="empty-comments">No comments yet. Be the first!</p>';
    return;
  }

  const topLevel = comments.filter(c => !c.parent_id);
  const replies = comments.filter(c => c.parent_id);
  const fragment = document.createDocumentFragment();

  topLevel.forEach(c => {
    const div = document.createElement("div");
    div.className = "comment";
    const cUsername = c.profiles?.username || "Anonymous";
    const cAvatar = getAvatarData(c.user_id, cUsername);
    div.innerHTML = `
      <div class="avatar" style="background:${cAvatar.color}">${cAvatar.letter}</div>
      <div class="comment-body">
        <div class="comment-name">${escapeHtml(cUsername)}</div>
        <div class="comment-text" data-raw="${escapeHtml(c.content)}">${escapeHtml(c.content)}</div>
        <button class="reply-btn" data-comment-id="${c.id}">Reply</button>
        <div class="replies" data-parent-id="${c.id}"></div>
      </div>
    `;
    fragment.appendChild(div);

    const repliesContainer = div.querySelector(".replies");
    replies.filter(r => r.parent_id === c.id).forEach(r => {
      const rDiv = document.createElement("div");
      rDiv.className = "comment reply";
      const rUsername = r.profiles?.username || "Anonymous";
      const rAvatar = getAvatarData(r.user_id, rUsername);
      rDiv.innerHTML = `
        <div class="avatar" style="background:${rAvatar.color}">${rAvatar.letter}</div>
        <div class="comment-body">
          <div class="comment-name">${escapeHtml(rUsername)}</div>
          <div class="comment-text" data-raw="${escapeHtml(r.content)}">${escapeHtml(r.content)}</div>
        </div>
      `;
      repliesContainer.appendChild(rDiv);
    });
  });

  commentsList.appendChild(fragment);
  commentsList.querySelectorAll(".reply-btn").forEach(btn => {
    btn.addEventListener("click", () => showReplyInput(parseInt(btn.dataset.commentId)));
  });

  commentsList.scrollTop = commentsList.scrollHeight;
  await processMentions();
}

function showReplyInput(parentId) {
  const existing = document.getElementById("replyInputBar");
  if (existing) existing.remove();

  const parentReply = document.querySelector(`.replies[data-parent-id="${parentId}"]`);
  if (!parentReply) return;

  const replyBar = document.createElement("div");
  replyBar.id = "replyInputBar";
  replyBar.className = "reply-input-bar";
  replyBar.innerHTML = `
    <input type="text" id="replyInput" placeholder="Write a reply..." maxlength="300">
    <button id="sendReply" class="send-btn">Send</button>
  `;
  parentReply.appendChild(replyBar);

  const replyInput = document.getElementById("replyInput");
  const sendReplyBtn = document.getElementById("sendReply");
  if (replyInput) replyInput.focus();

  const submit = async () => {
    const text = replyInput.value.trim();
    if (!text) return;
    sendReplyBtn.disabled = true;
    const result = await createComment(currentWhisperId, text, parentId);
    if (result) {
      replyBar.remove();
      await loadComments();
    } else {
      sendReplyBtn.disabled = false;
    }
  };

  if (sendReplyBtn) sendReplyBtn.addEventListener("click", submit);
  if (replyInput) {
    replyInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") submit();
    });
  }
}

if (closeComments) {
  closeComments.addEventListener("click", () => {
    if (commentsModal) commentsModal.hidden = true;
    currentWhisperId = null;
    if (commentInput) commentInput.value = "";
  });
}

if (sendComment) {
  sendComment.addEventListener("click", async () => {
    const text = commentInput.value.trim();
    if (!text || !currentWhisperId) return;
    sendComment.disabled = true;
    const result = await createComment(currentWhisperId, text);
    if (result) {
      commentInput.value = "";
      await loadComments();
    }
    sendComment.disabled = false;
  });
}

if (commentInput) {
  commentInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && sendComment) sendComment.click();
  });
}

// ═══════════════════════════════
// Comments Sheet — Drag to Dismiss
// ═══════════════════════════════

const commentsSheet = document.getElementById("commentsSheet");
const dragHandle = document.getElementById("dragHandle");

let dragStartY = 0;
let dragCurrentY = 0;
let isDragging = false;
const DISMISS_THRESHOLD = 100;

function onDragStart(e) {
  isDragging = true;
  dragStartY = e.touches ? e.touches[0].clientY : e.clientY;
  dragCurrentY = dragStartY;
  if (commentsSheet) commentsSheet.classList.add("dragging");
}

function onDragMove(e) {
  if (!isDragging) return;
  dragCurrentY = e.touches ? e.touches[0].clientY : e.clientY;
  const delta = dragCurrentY - dragStartY;
  if (delta > 0 && commentsSheet) commentsSheet.style.transform = `translateY(${delta}px)`;
}

function onDragEnd() {
  if (!isDragging) return;
  isDragging = false;
  if (commentsSheet) commentsSheet.classList.remove("dragging");

  const delta = dragCurrentY - dragStartY;
  if (delta > DISMISS_THRESHOLD) {
    if (commentsSheet) commentsSheet.style.transform = `translateY(100%)`;
    setTimeout(() => {
      if (commentsModal) commentsModal.hidden = true;
      if (commentsSheet) commentsSheet.style.transform = "";
      currentWhisperId = null;
      if (commentInput) commentInput.value = "";
    }, 250);
  } else {
    if (commentsSheet) commentsSheet.style.transform = "";
  }
  dragStartY = 0;
  dragCurrentY = 0;
}

if (dragHandle && commentsSheet) {
  dragHandle.addEventListener("touchstart", onDragStart, { passive: true });
  dragHandle.addEventListener("touchmove", onDragMove, { passive: true });
  dragHandle.addEventListener("touchend", onDragEnd);
  dragHandle.addEventListener("mousedown", onDragStart);
  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup", onDragEnd);
}

// ═══════════════════════════════
// Export for auth.js
// ═══════════════════════════════

window.handleRoute = handleRoute;
window.updateBlueDot = updateBlueDot;