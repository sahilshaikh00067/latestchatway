import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./components/Login";
import Header from "./components/Header";
import Dashboard from "./components/Dashboard";
import AdminRoute from "./components/category/AdminRoute";

import WappCampaign from "./components/category/WappCampaign";
import WappReports from "./components/category/WappReports";

import AddUser from "./components/AddUser";
import ManageUser from "./components/ManageUser";
import CreditHistory from "./components/category/CreditHistory";
import Logout from "./components/Logout";
import ChangePassword from "./components/ChangePassword";

import PageNotFound from "./components/PageNotFound";
import WappDpCampaign from "./components/category/WappDpCampaign";
// import WhatsappScan from "./components/WhatsappScan";

function App() {
  const user = JSON.parse(sessionStorage.getItem("user"));

  return (
    <Routes>

      {/* 🔥 DEFAULT */}
      <Route path="/" element={<Navigate to="/login" />} />

      {/* 🔓 PUBLIC */}
      <Route path="/login" element={<Login />} />

      {/* 🔒 PROTECTED */}
      <Route element={<AdminRoute />}>

        {/* 🔥 HEADER LAYOUT */}
        <Route element={<Header />}>

          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/wappdpcampaign" element={<WappDpCampaign />} />

          {/* ✅ ALL USERS */}  
          <Route path="/wappcampaign" element={<WappCampaign />} />
          <Route path="/wappreports" element={<WappReports />} />
          <Route path="/changepassword" element={<ChangePassword />} />
          <Route path="/logout" element={<Logout />} />

          {/* 🔥 ADMIN + RESELLER ONLY */}
          <Route
            path="/adduser"
            element={
              user?.role !== "user"
                ? <AddUser />
                : <Navigate to="/dashboard" />
            }
          />

          <Route
            path="/manageuser"
            element={
              user?.role !== "user"
                ? <ManageUser />
                : <Navigate to="/dashboard" />
            }
          />

          <Route
            path="/credithistory"
            element={
              user?.role !== "user"
                ? <CreditHistory />
                : <Navigate to="/dashboard" />
            }
          />

        </Route>
      </Route>

      {/* ❌ 404 */}
      <Route path="*" element={<PageNotFound />} />

    </Routes>
  );
}

export default App;