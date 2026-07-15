"use client";

import { useState, useRef, useCallback } from "react";
import Cropper, { type Area } from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { getCroppedImg } from "@/lib/crop-image";
import { authAPI } from "@/lib/api";
import { showNotification } from "@/components/notification-provider";
import { getErrorDetail } from "@/lib/error-utils";
import { Loader2, RotateCw, ZoomIn, ZoomOut, Upload, Trash2, Camera } from "lucide-react";

interface ProfilePhotoEditDialogProps {
  /** Current photo URL of the user */
  photoUrl?: string | null;
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback to change open state */
  onOpenChange: (open: boolean) => void;
  /** Callback to refresh user data after successful upload */
  onRefreshUser?: () => Promise<void>;
  /** Optional callback to notify when the photo changes */
  onPhotoChange?: (url: string | null) => void;
}

export default function ProfilePhotoEditDialog({
  photoUrl,
  isOpen,
  onOpenChange,
  onRefreshUser,
  onPhotoChange,
}: ProfilePhotoEditDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Selected image source (as data URL or object URL)
  const [selectedImage, setSelectedImage] = useState<string | null>(photoUrl || null);
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Crop states
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  
  // Loading & error states
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Store the cropped pixels for compilation
  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  // Handle file reading
  const loadFile = (file: File) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      showNotification("Invalid file type. Please upload JPEG, PNG, GIF, or WebP.", "error");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showNotification("File too large. Maximum size is 5MB.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
      // Reset cropping adjustments when a new image is loaded
      setZoom(1);
      setRotation(0);
      setCrop({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadFile(file);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      loadFile(file);
    }
  };

  // Compile crop + upload to backend
  const handleSave = async () => {
    if (!selectedImage || !croppedAreaPixels) {
      showNotification("Please select an image first.", "error");
      return;
    }

    setIsSaving(true);
    try {
      // Get the cropped image blob
      const croppedBlob = await getCroppedImg(selectedImage, croppedAreaPixels, rotation);
      if (!croppedBlob) {
        throw new Error("Failed to crop image. Please try again.");
      }

      // Convert Blob to a File object
      const croppedFile = new File([croppedBlob], "profile-photo.jpg", {
        type: "image/jpeg",
        lastModified: Date.now(),
      });

      // Upload via backend endpoint
      const updatedUser = await authAPI.uploadProfilePhoto(croppedFile);
      const newUrl = updatedUser.profile_photo_url || null;

      // Update state and refresh
      onPhotoChange?.(newUrl);
      if (onRefreshUser) {
        await onRefreshUser();
      }

      showNotification("Profile photo updated successfully!", "success");
      onOpenChange(false);
    } catch (error: unknown) {
      showNotification(getErrorDetail(error) || "Failed to update profile photo.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Delete profile photo
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await authAPI.deleteProfilePhoto();
      setSelectedImage(null);
      onPhotoChange?.(null);
      if (onRefreshUser) {
        await onRefreshUser();
      }
      showNotification("Profile photo removed.", "success");
      onOpenChange(false);
    } catch (error: unknown) {
      showNotification(getErrorDetail(error) || "Failed to remove profile photo.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const isPending = isSaving || isDeleting;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isPending && onOpenChange(open)}>
      <DialogContent className="sm:max-w-[460px] p-4 sm:p-6 overflow-hidden bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
            Edit Profile Photo
          </DialogTitle>
          <DialogDescription className="text-zinc-500 dark:text-zinc-400 text-xs">
            Zoom, rotate, and position your photo. The photo will be cropped to a circle.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />

        {selectedImage ? (
          <div className="space-y-5">
            {/* Cropper Viewport */}
            <div className="relative w-full h-[280px] sm:h-[320px] bg-zinc-950 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800">
              <Cropper
                image={selectedImage}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
              />
            </div>

            {/* Adjustments Controls */}
            <div className="space-y-4 px-1">
              {/* Zoom Control */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <ZoomOut className="w-3.5 h-3.5" />
                    Zoom
                  </span>
                  <span>{zoom.toFixed(1)}x</span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.05}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1 h-1 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    aria-label="Zoom slider"
                  />
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
                    className="p-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Rotation Control */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <RotateCw className="w-3.5 h-3.5" />
                    Rotation
                  </span>
                  <span>{rotation}°</span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    value={rotation}
                    min={-180}
                    max={180}
                    step={1}
                    onChange={(e) => setRotation(Number(e.target.value))}
                    className="flex-1 h-1 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    aria-label="Rotation slider"
                  />
                  <button
                    type="button"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    className="p-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-semibold px-2"
                    aria-label="Rotate 90 degrees"
                  >
                    +90°
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Actions inside Dialog Body */}
            <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50"
              >
                Upload different photo
              </button>

              {photoUrl && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isPending}
                  className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 px-2 py-1 rounded transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove photo
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Drag & Drop Upload Zone */
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all duration-300 ${
              isDragOver
                ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/10 scale-[0.98]"
                : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
            }`}
          >
            <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-full text-zinc-500 dark:text-zinc-400 mb-4 transition-transform group-hover:scale-105">
              <Upload className="w-6 h-6 animate-bounce" />
            </div>
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Drag and drop your photo here
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              Supports JPEG, PNG, WebP, or GIF (max 5MB)
            </p>
            <button
              type="button"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow transition-colors inline-flex items-center gap-1.5"
            >
              <Camera className="w-3.5 h-3.5" />
              Browse Files
            </button>
          </div>
        )}

        <DialogFooter className="mt-4 sm:mt-6 flex flex-row items-center justify-end gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          {selectedImage && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow hover:shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Photo"
              )}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
