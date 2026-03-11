// app/owner/[id]/menu/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ChevronLeft,
  Plus,
  Soup,
  Wallet,
  PackageCheck,
  PackageX,
  Trash2,
  RefreshCw,
  Store,
  Pencil,
  Images,
} from "lucide-react";
import { apiFetch } from "@/src/lib/api";
import ImageDropUploader from "@/app/components/ImageDropUploader";
import RequireAuth from "@/app/components/RequireAuth";

type MenuItem = {
  menu_id: number;
  restaurant_id: number;
  menu_name: string;
  description?: string | null;
  price: number;
  image_url?: string | null;
  is_available: number;
};

function ImagePlaceholder({
  text,
  heightClass = "h-20",
}: {
  text: string;
  heightClass?: string;
}) {
  return (
    <div
      className={`flex w-full items-center justify-center rounded-xl border border-dashed border-orange-200 bg-orange-50 text-xs text-gray-400 ${heightClass}`}
    >
      {text}
    </div>
  );
}

export default function OwnerMenuPage() {
  const params = useParams<{ id: string }>();
  const restaurantId = Number(params.id);

  const [items, setItems] = useState<MenuItem[]>([]);
  const [menuName, setMenuName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [menuImageFile, setMenuImageFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [loadingList, setLoadingList] = useState(false);
  const [loadingAdd, setLoadingAdd] = useState(false);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [uploaderKey, setUploaderKey] = useState(0);
  const [replacingId, setReplacingId] = useState<number | null>(null);

  const showMsg = (text: string, isSuccess = false) => {
    setSuccess(isSuccess);
    setMsg(text);
    setTimeout(() => setMsg(null), 3000);
  };

  const load = useCallback(async () => {
    if (!restaurantId) return;

    setLoadingList(true);
    try {
      const res = await apiFetch(`/api/menu/restaurant/${restaurantId}`);
      setItems(res.data || []);
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "โหลดเมนูไม่สำเร็จ");
    } finally {
      setLoadingList(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadMenuImage = async (menuId: number, file: File) => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;

    const formData = new FormData();
    formData.append("image", file);

    const apiBase = process.env.NEXT_PUBLIC_API_BASE || "https://project-restaurant-search-5.onrender.com";

    const res = await fetch(`${apiBase}/api/menu/${menuId}/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "อัปโหลดรูปเมนูไม่สำเร็จ");
  };

  const addMenu = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMsg(null);

    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      showMsg("ราคาต้องเป็นตัวเลขที่ไม่ติดลบ");
      return;
    }

    setLoadingAdd(true);
    try {
      const createRes = await apiFetch("/api/menu", {
        method: "POST",
        body: JSON.stringify({
          restaurant_id: restaurantId,
          menu_name: menuName,
          description: description || null,
          price: priceNum,
        }),
      });

      const createdMenuId = createRes.menu_id;

      if (menuImageFile && createdMenuId) {
        await uploadMenuImage(createdMenuId, menuImageFile);
      }

      setMenuName("");
      setDescription("");
      setPrice("0");
      setMenuImageFile(null);
      setUploaderKey((k) => k + 1);

      showMsg("เพิ่มเมนูสำเร็จ", true);
      await load();
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "เพิ่มเมนูไม่สำเร็จ");
    } finally {
      setLoadingAdd(false);
    }
  };

  const replaceMenuImage = async (menuId: number, file: File | null) => {
    if (!file) return;

    setActioningId(menuId);
    try {
      await uploadMenuImage(menuId, file);
      setReplacingId(null);
      showMsg("เปลี่ยนรูปเมนูสำเร็จ", true);
      await load();
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "อัปโหลดรูปเมนูไม่สำเร็จ");
    } finally {
      setActioningId(null);
    }
  };

  const toggleAvailable = async (menuId: number) => {
    if (actioningId !== null) return;

    setActioningId(menuId);
    try {
      await apiFetch(`/api/menu/${menuId}/toggle-available`, {
        method: "PATCH",
      });
      await load();
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "เปลี่ยนสถานะเมนูไม่สำเร็จ");
    } finally {
      setActioningId(null);
    }
  };

  const removeMenu = async (menuId: number) => {
    if (!confirm("ลบเมนูนี้?")) return;
    if (actioningId !== null) return;

    setActioningId(menuId);
    try {
      await apiFetch(`/api/menu/${menuId}`, { method: "DELETE" });
      showMsg("ลบเมนูสำเร็จ", true);
      await load();
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "ลบเมนูไม่สำเร็จ");
    } finally {
      setActioningId(null);
    }
  };

  return (
    <RequireAuth allow={["OWNER"]}>
      <div className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-white">
        <div className="mx-auto max-w-5xl px-4 py-8">
          {/* Header */}
          <div className="mb-6 rounded-3xl bg-gradient-to-r from-orange-500 to-orange-400 px-6 py-6 text-white shadow-lg">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Link
                  href="/owner"
                  className="inline-flex items-center gap-1 text-white/90 transition hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Owner Dashboard
                </Link>

                <span className="text-white/40">|</span>

                <Link
                  href={`/owner/${restaurantId}/images`}
                  className="inline-flex items-center gap-1 text-white/90 transition hover:text-white"
                >
                  <Images className="h-4 w-4" />
                  จัดการรูปภาพ
                </Link>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                    <Soup className="h-7 w-7" />
                  </div>

                  <div>
                    <h1 className="text-3xl font-bold leading-tight">
                      จัดการเมนู
                    </h1>
                    <p className="mt-1 text-sm text-orange-50">
                      ร้าน #{restaurantId}
                    </p>
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs text-white/90">
                      <Store className="h-3.5 w-3.5" />
                      เพิ่ม ลบ และอัปเดตสถานะเมนูอาหาร
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => void load()}
                  disabled={loadingList}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-orange-600 shadow-sm transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingList ? "animate-spin" : ""}`} />
                  รีเฟรช
                </button>
              </div>
            </div>
          </div>

          {/* Message */}
          {msg && (
            <div
              className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${
                success
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-600"
              }`}
            >
              {msg}
            </div>
          )}

          {/* Add form */}
          <form
            onSubmit={addMenu}
            className="mb-8 rounded-3xl border border-orange-100 bg-white p-5 shadow-sm"
          >
            <div className="mb-4 flex items-center gap-2 text-base font-bold text-[#1F2937]">
              <Plus className="h-5 w-5 text-orange-500" />
              เพิ่มเมนูใหม่
            </div>

            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  ชื่อเมนู *
                </label>
                <input
                  value={menuName}
                  onChange={(e) => setMenuName(e.target.value)}
                  placeholder="ชื่อเมนู"
                  required
                  disabled={loadingAdd}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  รายละเอียด
                </label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="รายละเอียด (ไม่บังคับ)"
                  disabled={loadingAdd}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  ราคา (บาท)
                </label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="ราคา"
                  min={0}
                  disabled={loadingAdd}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  รูปเมนู
                </label>
                <ImageDropUploader
                  key={uploaderKey}
                  label="ลากรูปเมนูมาวางที่นี่ หรือกดเพื่อเลือกรูป"
                  onFileChange={setMenuImageFile}
                />
              </div>

              <button
                type="submit"
                disabled={loadingAdd}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-300"
              >
                <Plus className="h-4 w-4" />
                {loadingAdd ? "กำลังเพิ่ม..." : "เพิ่มเมนู"}
              </button>
            </div>
          </form>

          {/* List header */}
          <div className="mb-4 flex items-center gap-2">
            <Soup className="h-5 w-5 text-orange-500" />
            <h2 className="text-2xl font-bold text-[#1F2937]">
              รายการเมนูทั้งหมด
            </h2>
          </div>

          {/* Loading */}
          {loadingList && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm text-gray-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
              กำลังโหลดรายการเมนู...
            </div>
          )}

          {/* Empty state */}
          {!loadingList && items.length === 0 && (
            <div className="rounded-3xl border border-dashed border-orange-200 bg-white px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                <Soup className="h-8 w-8" />
              </div>
              <h2 className="text-lg font-semibold text-[#1F2937]">
                ยังไม่มีเมนู
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                เพิ่มเมนูแรกของร้านได้จากฟอร์มด้านบน
              </p>
            </div>
          )}

          {/* Menu list */}
          <div className="grid gap-4">
            {items.map((m) => {
              const safeSrc = m.image_url?.trim();
              const isActioning = actioningId === m.menu_id;

              return (
                <div
                  key={m.menu_id}
                  className={`rounded-3xl border p-4 shadow-sm transition ${
                    isActioning
                      ? "border-orange-200 bg-orange-50/50 opacity-70"
                      : "border-gray-100 bg-white hover:border-orange-200 hover:shadow-md"
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="w-full shrink-0 sm:w-[120px]">
                      {safeSrc ? (
                        <Image
                          src={safeSrc}
                          alt={m.menu_name}
                          width={120}
                          height={96}
                          unoptimized
                          className="h-24 w-full rounded-2xl border border-gray-100 object-cover"
                        />
                      ) : (
                        <ImagePlaceholder text="ไม่มีรูป" heightClass="h-24" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-[#1F2937]">
                            {m.menu_name}
                          </h3>
                          <p className="mt-1 text-sm text-gray-500">
                            {m.description || "-"}
                          </p>
                        </div>

                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                            m.is_available
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          {m.is_available ? "มีขาย" : "หมดชั่วคราว"}
                        </span>
                      </div>

                      <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600">
                        <Wallet className="h-4 w-4" />
                        {m.price} บาท
                      </div>

                      {replacingId === m.menu_id && (
                        <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
                          <div className="mb-3 text-sm font-medium text-gray-700">
                            เลือกรูปใหม่
                          </div>

                          <ImageDropUploader
                            label="ลากรูปมาวาง หรือกดเพื่อเลือก"
                            onFileChange={(file) =>
                              void replaceMenuImage(m.menu_id, file)
                            }
                          />

                          <button
                            type="button"
                            onClick={() => setReplacingId(null)}
                            className="mt-3 text-xs text-gray-500 transition hover:text-orange-500"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleAvailable(m.menu_id)}
                          disabled={actioningId !== null}
                          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                            actioningId !== null
                              ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                              : "border-gray-200 bg-white text-gray-700 hover:border-orange-300 hover:text-orange-600"
                          }`}
                        >
                          {m.is_available ? (
                            <PackageX className="h-4 w-4" />
                          ) : (
                            <PackageCheck className="h-4 w-4" />
                          )}

                          {isActioning
                            ? "กำลังดำเนินการ..."
                            : m.is_available
                            ? "ตั้งเป็นหมด"
                            : "มีขายอีกครั้ง"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setReplacingId(
                              replacingId === m.menu_id ? null : m.menu_id
                            )
                          }
                          disabled={actioningId !== null}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:border-orange-300 hover:text-orange-600 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          <Pencil className="h-4 w-4" />
                          เปลี่ยนรูป
                        </button>

                        <button
                          type="button"
                          onClick={() => void removeMenu(m.menu_id)}
                          disabled={actioningId !== null}
                          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                            actioningId !== null
                              ? "cursor-not-allowed border-red-100 bg-red-50 text-red-300"
                              : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                          }`}
                        >
                          <Trash2 className="h-4 w-4" />
                          ลบเมนู
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </RequireAuth>
  );
}