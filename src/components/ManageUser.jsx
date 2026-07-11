import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaKey, FaEdit } from "react-icons/fa";
import { RiDeleteBinLine } from "react-icons/ri";

const API = "https://www.cloudwhatsapp.in/api";

export default function ManageUser() {
  const navigate   = useNavigate();
  const loggedUser = JSON.parse(sessionStorage.getItem("user"));
  const role       = sessionStorage.getItem("role");

  const [users,       setUsers]       = useState([]);
  const [search,      setSearch]      = useState("");
  const [editUser,    setEditUser]    = useState(null);
  const [editForm,    setEditForm]    = useState({});
  const [creditModal, setCreditModal] = useState(null);
  const [creditAmt,   setCreditAmt]   = useState("");
  const [msg,         setMsg]         = useState("");

  const fetchUsers = async () => {
    const res  = await fetch(`${API}/get-my-users/?user_id=${loggedUser.id}`);
    const data = await res.json();
    if (data.status === "success") setUsers(data.users);
  };

  useEffect(() => { fetchUsers(); }, []);

  // ── Credit add / deduct ──────────────────────────
  const handleCredit = async () => {
    const amount = parseInt(creditAmt);
    if (!amount || amount <= 0) return setMsg("❌ Valid amount daalo");

    const endpoint = creditModal.mode === "add" ? "add-credit" : "deduct-credit";

    const res  = await fetch(`${API}/${endpoint}/`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        from_id: loggedUser.id,
        to_id:   creditModal.user.id,
        amount,
      }),
    });
    const data = await res.json();

    if (data.status === "success") {
      setMsg(`✅ ${data.message}`);
      if (role !== "admin") {
        const updated = { ...loggedUser, credit: data.your_credit };
        sessionStorage.setItem("user", JSON.stringify(updated));
      }
      setCreditModal(null);
      setCreditAmt("");
      fetchUsers();
    } else {
      setMsg(`❌ ${data.message}`);
    }
  };

  // ── Toggle status ────────────────────────────────
  const toggleStatus = async (userId) => {
    const res  = await fetch(`${API}/toggle-status/`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ user_id: userId }),
    });
    const data = await res.json();
    if (data.status === "success") fetchUsers();
  };

  // ── Delete ───────────────────────────────────────
  const handleDelete = async (userId) => {
    if (!window.confirm("Delete this user?")) return;
    const res  = await fetch(`${API}/delete-user/`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ user_id: userId }),
    });
    const data = await res.json();
    if (data.status === "success") fetchUsers();
  };

  // ── Reset password ───────────────────────────────
  const handleReset = async (userId) => {
    const pwd = prompt("Enter new password");
    if (!pwd) return;
    await fetch(`${API}/reset-password/`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ user_id: userId, password: pwd }),
    });
    alert("Password reset ✅");
  };

  // ── Edit save ────────────────────────────────────
  const handleEditSave = async () => {
    const res  = await fetch(`${API}/update-user/`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ user_id: editUser.id, ...editForm }),
    });
    const data = await res.json();
    if (data.status === "success") {
      alert("Updated ✅");
      setEditUser(null);
      fetchUsers();
    }
  };

  const filtered = users.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[16px]">
          NOTE = All campaigns will be delivered Between 8A.M to 6P.M - (Monday to Saturday)
        </marquee>
      </div>

      <div className="p-4">

        {/* SUCCESS / ERROR MESSAGE */}
{msg && (
  <div
    className={`premium-alert ${
      msg.startsWith("✅")
        ? "premium-success"
        : "premium-error"
    }`}
  >
    <div className="flex items-center gap-3">

      <div className="alert-icon">
        {msg.startsWith("✅") ? "✓" : "!"}
      </div>

      <div className="flex-1">
        <p className="font-semibold tracking-wide">
          {msg.startsWith("✅")
            ? "Success"
            : "Error"}
        </p>

        <p className="text-[13px] opacity-90">
          {msg}
        </p>
      </div>

      <button
        onClick={() => setMsg("")}
        className="close-btn"
      >
        ✕
      </button>

    </div>
  </div>
)}
        {/* TOP BAR */}
        <div className="w-[800px] bg-gray-100 border border-gray-300 p-2 mb-4 flex items-center gap-3">

          <input
            placeholder="Search username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input "
          />

          {/* 🔥 ADMIN = Add User + Add Reseller */}
          {role === "admin" && (
            <>
              <button
                onClick={() => navigate("/adduser?role=user")}
                className="btn-add-user"
              >
                + Add User
              </button>
            </>
          )}

          {/* 🔥 RESELLER = Only Add Reseller (apne liye sub-reseller) */}
          {role === "reseller" && (
            <>
              <button
                onClick={() => navigate("/adduser?role=user")}
                className="btn-add-user"
              >
                + Add User
              </button>

            </>
          )}

          {/* USER = kuch nahi */}
        </div>

        {/* TABLE */}
        <div className="bg-white border border-gray-300 rounded p-4">
          <h2 className="text-[18px] mb-4 text-gray-800">Manage Users</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse text-center">
              <thead className="bg-[#2FA4C7] text-white">
                <tr>
                  {["Sr", "Username", "Role", "Credit", "Status", "Parent", "Sub Users", "Joined", "Actions"].map((h) => (
                    <th key={h} className="p-3 border-r border-blue-400 last:border-0 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="py-8 text-gray-400">No users found</td>
                  </tr>
                ) : (
                  filtered.map((u, i) => (
                    <tr key={u.id} className="border-t bg-gray-50 hover:bg-gray-100">

                      <td className="p-3 border-r border-gray-200">{i + 1}</td>

                      <td className="border-r border-gray-200 font-medium">{u.username}</td>

                      {/* ROLE BADGE */}
                      <td className="border-r border-gray-200">
                        <span className={`px-2 py-1 rounded text-xs text-white
                          ${u.role === "admin"    ? "bg-purple-500" :
                            u.role === "reseller" ? "bg-blue-500"   : "bg-gray-500"}`}>
                          {u.role}
                        </span>
                      </td>

                      {/* CREDIT + ADD/DEDUCT */}
                      <td className="border-r border-gray-200">
                        <div className="flex items-center justify-center gap-1">
                          <span className="font-bold text-[#20A8D8]">{u.credit}</span>
                          {role !== "user" && (
                            <>
                              <button
                                onClick={() => {
                                  setCreditModal({ user: u, mode: "add" });
                                  setCreditAmt("");
                                  setMsg("");
                                }}
                                className="text-xs bg-[#4DBD74] text-white px-2 py-0.5 rounded hover:bg-green-600"
                              >+</button>
                              <button
                                onClick={() => {
                                  setCreditModal({ user: u, mode: "deduct" });
                                  setCreditAmt("");
                                  setMsg("");
                                }}
                                className="text-xs bg-[#F86C6B] text-white px-2 py-0.5 rounded hover:bg-red-600"
                              >−</button>
                            </>
                          )}
                        </div>
                      </td>

                      {/* STATUS TOGGLE */}
                      <td className="border-r border-gray-200">
                        <button
                          onClick={() => toggleStatus(u.id)}
                          className={`px-4 py-1 rounded-full text-white text-xs
                            ${u.status === "Active" ? "bg-[#4dbd74] hover:bg-green-600" : "bg-[#f86c6b] hover:bg-red-600"}`}
                        >
                          {u.status}
                        </button>
                      </td>

                      <td className="border-r border-gray-200 text-gray-500 text-xs">{u.parent}</td>
                      <td className="border-r border-gray-200">{u.sub_count}</td>
                      <td className="border-r border-gray-200 text-xs text-gray-500 whitespace-nowrap">{u.created_at}</td>

                      {/* ACTIONS */}
                      <td className="p-2">
                        <div className="flex justify-center gap-1">
                          <button
                            onClick={() => handleReset(u.id)}
                            title="Reset Password"
                            className="p-2 rounded-full bg-[#4dbd74] hover:bg-green-600 text-white"
                          ><FaKey size={11} /></button>

                          <button
                            onClick={() => {
                              setEditUser(u);
                              setEditForm({ username: u.username, role: u.role });
                            }}
                            title="Edit User"
                            className="p-2 rounded-full bg-[#63c2de] hover:bg-blue-500 text-white"
                          ><FaEdit size={11} /></button>

                          <button
                            onClick={() => handleDelete(u.id)}
                            title="Delete User"
                            className="p-2 rounded-full bg-[#f86c6b] hover:bg-red-600 text-white"
                          ><RiDeleteBinLine size={11} /></button>
                        </div>
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 text-sm text-gray-400">
            Showing {filtered.length} of {users.length} entries
          </div>
        </div>
      </div>

      {/* ── CREDIT MODAL ── */}
      {creditModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg p-6 w-[340px]">

            <h3 className="text-lg font-medium mb-1">
              {creditModal.mode === "add" ? "➕ Add Credit" : "➖ Deduct Credit"}
            </h3>

            <p className="text-sm text-gray-500 mb-1">
              User: <strong>{creditModal.user.username}</strong>
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Current Balance: <strong className="text-[#20A8D8]">{creditModal.user.credit}</strong>
              {role !== "admin" && (
                <span className="ml-3 text-gray-400">
                  (Your balance: {loggedUser.credit})
                </span>
              )}
            </p>

            {msg && (
              <p className={`text-sm mb-3 ${msg.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>
                {msg}
              </p>
            )}

            <input
              type="number"
              placeholder="Enter amount"
              value={creditAmt}
              onChange={(e) => setCreditAmt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCredit()}
              className="input w-full mb-4"
              autoFocus
            />

            <div className="flex gap-3">
              <button
                onClick={handleCredit}
                className={`flex-1 py-2 rounded text-white font-medium
                  ${creditModal.mode === "add"
                    ? "bg-[#4DBD74] hover:bg-green-600"
                    : "bg-[#F86C6B] hover:bg-red-600"}`}
              >
                {creditModal.mode === "add" ? "Add Credit" : "Deduct Credit"}
              </button>
              <button
                onClick={() => { setCreditModal(null); setMsg(""); }}
                className="flex-1 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ── */}
      {editUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg p-6 w-[360px]">

            <h3 className="text-lg font-medium mb-4">Edit User</h3>

            <label className="text-xs text-gray-500 mb-1 block">Username</label>
            <input
              value={editForm.username}
              onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
              className="input w-full mb-3"
            />

            <label className="text-xs text-gray-500 mb-1 block">Role</label>
            <select
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
              className="input w-full mb-5"
            >
              <option value="user">User</option>
              <option value="reseller">Reseller</option>
              {role === "admin" && <option value="admin">Admin</option>}
            </select>

            <div className="flex gap-3">
              <button
                onClick={handleEditSave}
                className="flex-1 py-2 rounded bg-[#20A8D8] hover:bg-blue-500 text-white font-medium"
              >Save</button>
              <button
                onClick={() => setEditUser(null)}
                className="flex-1 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700"
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .input {
          width: 100%;
          padding: 7px 10px;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          outline: none;
          font-size: 13px;
        }
        .input:focus { border-color: #20A8D8; }

        .search-input {
          padding: 6px 10px;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          outline: none;
          font-size: 12px;
          width: 200px;
        }
        .search-input:focus { border-color: #20A8D8; }

        .btn-add-user {
          background: #20A8D8;
          color: white;
          padding: 6px 14px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          white-space: nowrap;
        }
        .btn-add-user:hover { background: #1a9bc4; }

        .btn-add-reseller {
          background: #5b73e8;
          color: white;
          padding: 6px 14px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          white-space: nowrap;
        }
        .btn-add-reseller:hover { background: #4a61d4; }

        .premium-alert{
  position: relative;
  overflow: hidden;
  padding: 16px 18px;
  margin-bottom: 18px;
  border-radius: 18px;
  backdrop-filter: blur(14px);
  animation: alertSlide .45s ease;
  transform-style: preserve-3d;
  transition: all .35s ease;
  box-shadow:
    0 10px 30px rgba(0,0,0,.12),
    inset 0 1px 0 rgba(255,255,255,.4);
}

.premium-alert:hover{
  transform:
    translateY(-3px)
    scale(1.01);
  box-shadow:
    0 18px 40px rgba(0,0,0,.18),
    inset 0 1px 0 rgba(255,255,255,.5);
}

.premium-alert::before{
  content:"";
  position:absolute;
  top:0;
  left:-120%;
  width:120%;
  height:100%;
  background:linear-gradient(
    90deg,
    transparent,
    rgba(255,255,255,.28),
    transparent
  );
  animation: shine 3s infinite;
}

.premium-success{
  background:
    linear-gradient(
      135deg,
      rgba(34,197,94,.14),
      rgba(16,185,129,.18)
    );
  border:1px solid rgba(34,197,94,.28);
  color:#166534;
}

.premium-error{
  background:
    linear-gradient(
      135deg,
      rgba(239,68,68,.12),
      rgba(244,63,94,.16)
    );
  border:1px solid rgba(239,68,68,.25);
  color:#991b1b;
}

.alert-icon{
  width:42px;
  height:42px;
  min-width:42px;
  border-radius:14px;
  display:flex;
  align-items:center;
  justify-content:center;
  font-weight:700;
  font-size:18px;
  color:white;
  box-shadow:
    inset 0 1px 1px rgba(255,255,255,.4),
    0 6px 14px rgba(0,0,0,.15);
}

.premium-success .alert-icon{
  background:
    linear-gradient(
      135deg,
      #22c55e,
      #10b981
    );
}

.premium-error .alert-icon{
  background:
    linear-gradient(
      135deg,
      #ef4444,
      #f43f5e
    );
}

.close-btn{
  border:none;
  background:rgba(255,255,255,.35);
  width:30px;
  height:30px;
  border-radius:10px;
  cursor:pointer;
  transition:.3s;
  font-size:13px;
  font-weight:bold;
  backdrop-filter: blur(10px);
}

.close-btn:hover{
  transform:rotate(90deg) scale(1.1);
  background:rgba(255,255,255,.55);
}

@keyframes alertSlide{
  from{
    opacity:0;
    transform:
      translateY(-20px)
      scale(.96);
  }
  to{
    opacity:1;
    transform:
      translateY(0)
      scale(1);
  }
}

@keyframes shine{
  0%{
    left:-120%;
  }
  100%{
    left:130%;
  }
}
      `}</style>

    </div>
  );
}