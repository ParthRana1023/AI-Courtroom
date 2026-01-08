"use client";

import { useRef, useState, useEffect } from "react";
import { Camera, Trash2, Loader2 } from "lucide-react";
import { authAPI } from "@/lib/api";

interface ProfilePhotoProps {
  /** Current photo URL */
  photoUrl?: string | null;
  /** User's first name for initials */
  firstName?: string;
  /** User's last name for initials */
  lastName?: string;
  /** User's nickname */
  nickname?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Whether editing is allowed */
  editable?: boolean;
  /** Callback when photo changes (for registration - returns the uploaded URL) */
  onPhotoChange?: (url: string | null) => void;
  /** Callback to refresh user data (for profile page) */
  onRefreshUser?: () => Promise<void>;
  /** Show upload controls inline or below */
  layout?: "inline" | "stacked";
}

export default function ProfilePhoto({
  photoUrl,
  firstName = "",
  lastName = "",
  nickname,
  size = "md",
  editable = true,
  onPhotoChange,
  onRefreshUser,
  layout = "inline",
}: ProfilePhotoProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(
    photoUrl || null
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Sync with external photoUrl changes
  useEffect(() => {
    setCurrentPhotoUrl(photoUrl || null);
  }, [photoUrl]);

  // Get user initials for fallback
  const getInitials = () => {
    const first = firstName?.[0] || "";
    const last = lastName?.[0] || "";
    return (first + last).toUpperCase() || "?";
  };

  // Size classes
  const sizeClasses = {
    sm: {
      container: "w-16 h-16",
      text: "text-lg",
      icon: "w-4 h-4",
      spinner: "w-4 h-4",
    },
    md: {
      container: "w-20 h-20",
      text: "text-xl",
      icon: "w-5 h-5",
      spinner: "w-5 h-5",
    },
    lg: {
      container: "w-24 h-24",
      text: "text-2xl",
      icon: "w-6 h-6",
      spinner: "w-6 h-6",
    },
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setMessage({ type: "error", text: "Invalid file type" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: "error", text: "File too large (max 5MB)" });
      return;
    }

    setIsUploading(true);
    setMessage(null);

    try {
      const updatedUser = await authAPI.uploadProfilePhoto(file);
      const newUrl = updatedUser.profile_photo_url || null;
      setCurrentPhotoUrl(newUrl);
      onPhotoChange?.(newUrl);
      await onRefreshUser?.();
      setMessage({ type: "success", text: "Photo updated!" });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Upload failed" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!currentPhotoUrl) return;

    setIsDeleting(true);
    setMessage(null);

    try {
      await authAPI.deleteProfilePhoto();
      setCurrentPhotoUrl(null);
      onPhotoChange?.(null);
      await onRefreshUser?.();
      setMessage({ type: "success", text: "Photo removed!" });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Delete failed" });
    } finally {
      setIsDeleting(false);
    }
  };

  const isLoading = isUploading || isDeleting;

  return (
    <div
      className={`flex ${
        layout === "stacked" ? "flex-col items-center" : "items-center"
      } gap-4`}
    >
      {/* Avatar */}
      <div className="relative">
        <div
          className={`${sizeClasses[size].container} rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center shadow-md text-zinc-600 dark:text-zinc-300 ${sizeClasses[size].text} font-bold`}
        >
          {currentPhotoUrl ? (
            <img
              src={currentPhotoUrl}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          ) : (
            <span>{getInitials()}</span>
          )}
        </div>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
            <Loader2
              className={`${sizeClasses[size].spinner} text-white animate-spin`}
            />
          </div>
        )}
      </div>

      {/* User Name & Nickname */}
      <div className="flex flex-col">
        <span className="font-semibold text-zinc-800 dark:text-zinc-100">
          {firstName} {lastName}
        </span>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {nickname || getInitials()}
        </span>
      </div>

      {/* Controls */}
      {editable && (
        <div
          className={`flex ${
            layout === "stacked" ? "flex-row" : "flex-col"
          } gap-1`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            <Camera className="w-3 h-3" />
            {currentPhotoUrl ? "Change" : "Upload"}
          </button>
          {currentPhotoUrl && (
            <button
              onClick={handleDelete}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />
              Remove
            </button>
          )}
          {message && (
            <p
              className={`text-xs ${
                message.type === "success" ? "text-green-600" : "text-red-600"
              }`}
            >
              {message.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
