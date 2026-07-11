import { Formik } from "formik";
import { useState } from "react";
import * as Yup from "yup";
import { useNavigate } from "react-router-dom";

function Login() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");

  const validationSchema = Yup.object({
    username: Yup.string()
      .min(3, "Username too short")
      .required("Username is required"),
    password: Yup.string()
      .min(3, "Min 3 characters")
      .required("Password is required"),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-200">

      <div className="bg-white shadow rounded flex overflow-hidden w-[1000px]">

        {/* LEFT IMAGE */}
        <div className="w-[65%] flex items-center justify-center bg-white">
          <img src="/login.png" alt="login" className="w-[100%]" />
        </div>

        {/* RIGHT FORM */}
        <div className="w-[65%] p-10">

          <h2 className="text-4xl font-medium mb-1">Login</h2>
          <p className="text-gray-500 mb-3 text-lg">
            Just sign in if you have an account.
          </p>

          <Formik
            initialValues={{ username: "", password: "" }}
            validationSchema={validationSchema}

            onSubmit={async (values, { setSubmitting }) => {

              try {
                const res = await fetch("https://latestchatway.onrender.com/api/login/", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(values),
                });
                console.log("STATUS:", res.status);
                console.log("HTTP STATUS:", res.status);

                const data = await res.json();

                console.log("LOGIN RESPONSE:", data);

                if (data.status === "success") {

                  sessionStorage.clear();

                  sessionStorage.setItem("user_id", data.user_id);

                  sessionStorage.setItem("user", JSON.stringify({
                    id: data.user_id,
                    username: data.username,
                    role: data.role,
                    credit: data.credit
                  }));

                  sessionStorage.setItem("role", data.role);

                  console.log("SAVED USER:", sessionStorage.getItem("user"));

                  navigate("/dashboard");

                } else {
                  setMessage(data.message || "Invalid username or password ❌");
                }

              } catch (err) {
                console.log(err);
                setMessage("Server error ❌");
              }

              setSubmitting(false);
            }}
          >
            {({
              values,
              errors,
              touched,
              handleChange,
              handleBlur,
              handleSubmit,
              isSubmitting,
            }) => (
              <form onSubmit={handleSubmit}>

                <input
                  name="username"
                  placeholder="Username"
                  onChange={handleChange}
                  onBlur={handleBlur}
                  value={values.username}
                  className="input mb-2 text-lg"
                />
                <p className="error">
                  {errors.username && touched.username && errors.username}
                </p>

                <input
                  type="password"
                  name="password"
                  placeholder="Password"
                  onChange={handleChange}
                  onBlur={handleBlur}
                  value={values.password}
                  className="input mb-1 text-lg"
                />
                <p className="error">
                  {errors.password && touched.password && errors.password}
                </p>

                <p className="text-red-500 text-base mb-4">{message}</p>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-premium w-full mt-2 text-xl py-3"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="spinner" />
                      Logging in...
                    </span>
                  ) : (
                    "Login"
                  )}
                </button>

              </form>
            )}
          </Formik>
        </div>

      </div>

      {/* SAME CSS + PREMIUM BUTTON ADDED */}
      <style>{`
        .input {
          width: 100%;
          padding: 12px;
          border: 1px solid #22c55e;
          outline: none;
          border-radius: 4px;
          font-size: 15px;
        }
        .input:focus {
          border: 1px solid #16a34a;
          box-shadow: 0 0 0 1px #16a34a;
        }
        .btn {
          background: #6cc04a;
          color: white;
          padding: 12px;
          border-radius: 4px;
          font-weight: 500;
        }
        .btn:hover {
          background: #5aad3d;
        }
        .error {
          color: red;
          font-size: 12px;
        }

        /* 🔥 PREMIUM BUTTON UPGRADE */
        .btn-premium {
          cursor: pointer;
          position: relative;
          overflow: hidden;
          border: none;
          transition: transform 0.18s cubic-bezier(0.34,1.4,0.64,1),
                      box-shadow 0.18s ease,
                      background 0.18s ease;
          box-shadow: 0 4px 14px rgba(108,192,74,0.35);
        }
        .btn-premium:hover:not(:disabled) {
          transform: translateY(-2px) scale(1.015);
          box-shadow: 0 8px 22px rgba(108,192,74,0.5);
        }
        .btn-premium:active:not(:disabled) {
          transform: translateY(0) scale(0.98);
        }
        .btn-premium:disabled {
          cursor: not-allowed;
          opacity: 0.85;
        }
        .btn-premium::after {
          content: "";
          position: absolute; inset: 0;
          background: linear-gradient(
            105deg,
            transparent 40%,
            rgba(255,255,255,0.25) 50%,
            transparent 60%
          );
          background-size: 300% 100%;
          animation: btn-shimmer 2.6s infinite;
          pointer-events: none;
        }
        @keyframes btn-shimmer {
          0%   { background-position: -300% center; }
          100% { background-position:  300% center; }
        }

        .spinner {
          display: inline-block;
          width: 15px; height: 15px;
          border: 2px solid rgba(255,255,255,0.4);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.65s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

    </div>
  );
}

export default Login;