import React, { useEffect, useState } from "react";
import { Calendar } from "lucide-react";
// Top pe yeh import add karo
import * as XLSX from 'xlsx';

const WappReports = () => {
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState("Today");
  const [allEntries, setAllEntries] = useState([]);
  const [entries, setEntries] = useState([]);
  const [openRow, setOpenRow] = useState(null);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);

  const filters = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "This Month", "Last Month", "Custom Range"];
  // 🔥 AUTO-COMPLETE: Pending campaigns check karo
  useEffect(() => {
    const checkPending = () => {
      const currentUser = JSON.parse(sessionStorage.getItem("user"));
      const stored = JSON.parse(localStorage.getItem("wappReports")) || [];
      const now = Date.now();

      let updated = false;
      const newStored = stored.map((r) => {
        if (r.userId === currentUser?.username && r.status === "pending" && r.completeAt && now >= r.completeAt) {
          updated = true;
          return {
            ...r,
            status: "completed",
            valid: r.simulatedSuccess || 0,
            failed: r.simulatedFailed || 0,
            nonwa: 0,
            rejected: 0,
            numberResults: [],
          };
        }
        return r;
      });

      if (updated) {
        localStorage.setItem("wappReports", JSON.stringify(newStored));
        // allEntries refresh karo
        const myEntries = newStored.filter((r) => r.userId === currentUser?.username);
        setAllEntries(myEntries);
      }
    };

    // Page load pe ek baar check karo
    checkPending();

    // Har 60 second pe check karo (jab page khula ho)
    const interval = setInterval(checkPending, 60 * 1000);
    return () => clearInterval(interval);
  }, []);


  // 🔥 FILTER LOGIC
  useEffect(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let start, end;

    if (selectedFilter === "Today") {
      start = today.getTime();
      end = now.getTime();

    } else if (selectedFilter === "Yesterday") {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      start = y.getTime();
      end = today.getTime() - 1;

    } else if (selectedFilter === "Last 7 Days") {
      const d = new Date(today); d.setDate(d.getDate() - 7);
      start = d.getTime();
      end = now.getTime();

    } else if (selectedFilter === "Last 30 Days") {
      const d = new Date(today); d.setDate(d.getDate() - 30);
      start = d.getTime();
      end = now.getTime();

    } else if (selectedFilter === "This Month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      end = now.getTime();

    } else if (selectedFilter === "Last Month") {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      end = new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1;

    } else if (selectedFilter === "Custom Range") {
      if (!customStart || !customEnd) { setEntries(allEntries); return; }
      start = new Date(customStart).getTime();
      end = new Date(customEnd).getTime() + 86399999;
    }

    const result = allEntries.filter((e) => e.rawDate >= start && e.rawDate <= end);
    setEntries(result);
    setPage(1);

  }, [selectedFilter, allEntries, customStart, customEnd]);

  const toggleRow = (i) => setOpenRow(openRow === i ? null : i);

  const handleDownload = (data) => {
    const rows = (data.numberResults || []).map(r => ({
      Number: r.number,
      Status: r.status.toUpperCase()
    }));

    if (rows.length === 0) {
      alert("No number data available for this campaign.");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 18 }, { wch: 12 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${data.name || 'report'}.xlsx`);
  };

  // PAGINATION
  const totalPages = Math.ceil(entries.length / perPage);
  const paginated = entries.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="min-h-screen bg-[#f1f1f1]">
      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 font-normal text-[18px]">
          NOTE = All campaigns will be delivered Between 8A.M to 6P.M - (Monday to Saturday) on working days.
        </marquee>
      </div>

      <div className="p-4">
        <div className="bg-white border border-gray-300 rounded">

          {/* HEADER */}
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="font-semibold text-[18px] text-gray-800">Whatsapp Report</h2>

            <div className="relative">
              <div
                onClick={() => setFilterOpen(!filterOpen)}
                className="flex items-center gap-2 bg-[#4DBD74] text-white px-4 py-2 rounded cursor-pointer"
              >
                <Calendar size={16} /> {selectedFilter}
              </div>

              {filterOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-300 rounded shadow z-50">
                  {filters.map((f, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        setSelectedFilter(f);
                        setFilterOpen(false);
                        setShowCustom(f === "Custom Range");
                      }}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                    >
                      {f}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* CUSTOM DATE RANGE */}
          {showCustom && (
            <div className="px-4 py-3 flex gap-3 items-center border-b bg-gray-50">
              <label className="text-sm">From:</label>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                className="border border-gray-300 px-2 py-1 rounded outline-none text-sm" />
              <label className="text-sm">To:</label>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                className="border border-gray-300 px-2 py-1 rounded outline-none text-sm" />
            </div>
          )}

          <div className="p-4">
            <div className="mb-3 flex items-center gap-2 text-sm">
              <span>Show</span>
              <select
                className="border border-gray-300 px-2 py-1 rounded outline-none"
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span>entries</span>
            </div>

            {/* TABLE */}
            <div className="border border-gray-300">
              <table className="w-full text-[15px] border-collapse text-center">
                <thead className="bg-[#20a8d8] text-white">
                  <tr>
                    <th className="px-2 py-2 border-r border-gray-300"></th>
                    <th className="px-3 py-2 border-r border-gray-300">Campname</th>
                    <th className="px-3 py-2 border-r border-gray-300">Number</th>
                    <th className="px-3 py-2 border-r border-gray-300">Message</th>
                    <th className="px-3 py-2 border-r border-gray-300">Status</th>
                    <th className="px-3 py-2 border-r border-gray-300">Submit Date</th>
                    <th className="px-3 py-2">Download</th>
                  </tr>
                </thead>

                <tbody>
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-6 text-gray-600">No data available in table</td>
                    </tr>
                  ) : (
                    paginated.map((e, i) => (
                      <React.Fragment key={i}>
                        <tr className="border-t bg-gray-200">
                          <td className="border-r border-gray-300">
                            <button
                              onClick={() => toggleRow(i)}
                              className="bg-[#4dbd74] text-white w-5 h-6 rounded-full"
                            >
                              {openRow === i ? "-" : "+"}
                            </button>
                          </td>
                          <td className="px-3 py-2 border-r border-gray-300">{e.name}</td>
                          <td className="px-3 py-2 border-r border-gray-300">{e.number}</td>
                          <td className="px-3 py-2 border-r border-gray-300 max-w-[200px] truncate">{e.message}</td>
                          <td className="px-3 py-2 border-r border-gray-300">
                            {e.status === "pending" ? (
                              <span className="bg-orange-400 text-white px-2 py-1 text-xs rounded-full animate-pulse">
                                ⏳ PENDING
                              </span>
                            ) : (
                              <span className="bg-[#4dbd74] text-white px-2 py-1 text-xs rounded-full">
                                ✅ COMPLETED
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 border-r border-gray-300">{e.date}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => handleDownload(e)} className="bg-[#20A8D8] text-white px-3 py-1 rounded-full text-xs">
                              Download
                            </button>
                          </td>
                        </tr>

                        {openRow === i && (
                          <tr>
                            <td colSpan="7" className="bg-gray-100">
                              <div className="p-3 text-left">
                                {e.image && <><p><b>Image:</b></p><img src={e.image} className="w-[200px] mt-2" /></>}
                                {e.video && <><p className="mt-3"><b>Video:</b></p><video src={e.video} controls className="w-[200px]" /></>}
                                {e.pdf && <><p className="mt-3"><b>PDF:</b></p><a href={e.pdf} target="_blank" className="text-blue-500">View PDF</a></>}

                                <div className="flex gap-2 mt-4 flex-wrap justify-center">
                                  <span className="bg-[#20A8D8] text-white px-3 py-1">TOTAL {e.total || 0}</span>
                                  <span className="bg-[#F86C6B] text-white px-3 py-1">NONWA {e.nonwa || 0}</span>
                                  <span className="bg-gray-500 text-white px-3 py-1">FAILED {e.failed || 0}</span>
                                  <span className="bg-orange-400 text-white px-3 py-1">REJECTED {e.rejected || 0}</span>
                                  <span className="bg-[#4DBD74] text-white px-3 py-1">VALID {e.valid || 0}</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}
            <div className="flex justify-between mt-4 text-sm">
              <span>Showing {entries.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, entries.length)} of {entries.length} entries</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  className="border px-3 py-1 hover:bg-gray-200 disabled:opacity-40"
                >Previous</button>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page === totalPages || totalPages === 0}
                  className="border px-3 py-1 hover:bg-gray-200 disabled:opacity-40"
                >Next</button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default WappReports;