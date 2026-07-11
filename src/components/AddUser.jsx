import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const API = "https://www.cloudwhatsapp.in/api";

const AddUser = () => {
  const navigate = useNavigate();
  const currentUser = JSON.parse(sessionStorage.getItem("user"));
  const role = sessionStorage.getItem("role");

  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "",
    email: "",
    mobile: "",
    company: "",
    city: "",
    role: "user",
    credit: "",
  });

  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");

    if (!form.username || !form.password) {
      return setMsg("❌ Username & password required");
    }

    setLoading(true);

    try {
      const res = await fetch(`${API}/create-user/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator_id: currentUser?.id,
          username: form.username,
          password: form.password,
          role: form.role,
          credit: parseInt(form.credit) || 0,
        }),
      });

      const data = await res.json();

      if (data.status === "success") {
        setMsg(`✅ ${data.message}`);

        // Update session credit if reseller (admin = unlimited)
        if (role !== "admin" && data.your_credit !== "unlimited") {
          const updated = { ...currentUser, credit: data.your_credit };
          sessionStorage.setItem("user", JSON.stringify(updated));
        }

        // Reset form
        setForm({
          name: "", username: "", password: "", email: "",
          mobile: "", company: "", city: "", role: "user", credit: "",
        });

        setTimeout(() => navigate("/manageuser"), 1200);

      } else {
        setMsg(`❌ ${data.message || "Something went wrong"}`);
      }

    } catch (err) {
      console.error(err);
      setMsg("❌ Network / backend error");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[18px]">
          NOTE = All campaigns will be delivered Between 8A.M to 6P.M - (Monday to Saturday)
        </marquee>
      </div>

      <div className="flex justify-center p-6">
        <div className="w-[55%] bg-white p-6 shadow-sm">

          <h2 className="text-[18px] mb-5 text-gray-800">Add New User</h2>

          {/* MESSAGE */}
          {msg && (
            <div
              className={`premium-alert ${msg.startsWith("✅")
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

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-5">

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Username *</label>
                <input
                  name="username"
                  value={form.username}
                  placeholder="Username"
                  onChange={handleChange}
                  className="input"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Password *</label>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  placeholder="Password"
                  onChange={handleChange}
                  className="input"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Name</label>
                <input
                  name="name"
                  value={form.name}
                  placeholder="Full Name"
                  onChange={handleChange}
                  className="input"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Mobile</label>
                <input
                  name="mobile"
                  value={form.mobile}
                  placeholder="Mobile Number"
                  onChange={handleChange}
                  className="input"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Email</label>
                <input
                  name="email"
                  value={form.email}
                  placeholder="Email"
                  onChange={handleChange}
                  className="input"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Company</label>
                <input
                  name="company"
                  value={form.company}
                  placeholder="Company"
                  onChange={handleChange}
                  className="input"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">City</label>
                <input
                  name="city"
                  value={form.city}
                  placeholder="City"
                  onChange={handleChange}
                  className="input"
                />
              </div>

              {/* Role — reseller sirf user bana sakta hai */}
              {/* 🔥 ROLE SELECT */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  Role
                </label>

                <select
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  className="input"
                >
                  {/* Sab bana sakte */}
                  <option value="user">User</option>

                  {/* Admin + Reseller reseller bana sakte */}
                  {(role === "admin" || role === "reseller") && (
                    <option value="reseller">Reseller</option>
                  )}

                  {/* Sirf admin admin bana sakta */}
                  {role === "admin" && (
                    <option value="admin">Admin</option>
                  )}
                </select>
              </div>

              {/* Initial Credit */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  Initial Credit
                  {role !== "admin" && (
                    <span className="ml-2 text-[#20A8D8] font-medium">
                      (Your balance: {currentUser?.credit ?? 0})
                    </span>
                  )}
                  {role === "admin" && (
                    <span className="ml-2 text-purple-500 font-medium">(Unlimited)</span>
                  )}
                </label>
                <input
                  type="number"
                  name="credit"
                  value={form.credit}
                  placeholder="0"
                  min="0"
                  onChange={handleChange}
                  className="input"
                />
              </div>

            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn mt-6 px-8"
            >
              {loading ? "Creating..." : "Add User"}
            </button>

          </form>
        </div>

        <div className="w-[45%]" />
      </div>

      <style>{`
        .input {
          width: 100%;
          padding: 8px;
          border: 1px solid #e5e7eb;
          background: white;
          outline: none;
          border-radius: 3px;
        }
        .input:focus {
          border: 1px solid #22d3ee;
          box-shadow: 0 0 0 1px #22d3ee;
        }
        .btn {
          background: #20A8D8;
          color: white;
          padding: 8px 20px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 14px;
        }
        .btn:hover { background: #1a9bc4; }
        .btn:disabled { background: #9ca3af; cursor: not-allowed; }
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
};

export default AddUser;