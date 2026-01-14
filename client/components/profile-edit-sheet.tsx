"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { authAPI } from "@/lib/api";
import { showNotification } from "@/components/notification-provider";
import LocationSelector from "@/components/location-selector";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
} from "@/components/animate-ui/components/radix/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/animate-ui/components/radix/dropdown-menu";
import ProfilePhoto from "@/components/profile-photo";
import { Pencil, Loader2, Check, ChevronDown } from "lucide-react";

interface ProfileEditSheetProps {
  children?: React.ReactNode;
}

export default function ProfileEditSheet({ children }: ProfileEditSheetProps) {
  const { user, refreshUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    nickname: "",
    gender: "",
    city: "",
    state: "",
    state_iso2: "",
    country: "",
    country_iso2: "",
    phone_code: "",
  });

  // Sync form data when sheet opens or user changes
  useEffect(() => {
    if (user && open) {
      setFormData({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        nickname: user.nickname || "",
        gender: user.gender || "",
        city: user.city || "",
        state: user.state || "",
        state_iso2: user.state_iso2 || "",
        country: user.country || "",
        country_iso2: user.country_iso2 || "",
        phone_code: user.phone_code || "",
      });
    }
  }, [user, open]);

  const handleSubmit = async () => {
    setIsLoading(true);

    try {
      await authAPI.updateProfile({
        first_name: formData.first_name,
        last_name: formData.last_name,
        nickname: formData.nickname || undefined,
        gender: formData.gender || undefined,
        city: formData.city || undefined,
        state: formData.state || undefined,
        state_iso2: formData.state_iso2 || undefined,
        country: formData.country || undefined,
        country_iso2: formData.country_iso2 || undefined,
        phone_code: formData.phone_code || undefined,
      });
      await refreshUser();
      showNotification("Profile updated successfully!", "success");
      setOpen(false);
    } catch (error: any) {
      showNotification(error.message || "Failed to update profile", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const genderOptions = [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "others", label: "Others" },
    { value: "prefer-not-to-say", label: "Prefer not to say" },
  ];

  const getGenderLabel = (value: string) => {
    return (
      genderOptions.find((opt) => opt.value === value)?.label || "Select gender"
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {children || (
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
            <Pencil className="w-4 h-4" />
            Edit Profile
          </button>
        )}
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[320px] sm:w-[360px] overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="text-xl">Edit Profile</SheetTitle>
          <SheetDescription>
            Update your profile information. Photo, nickname, name, and gender
            can be changed.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          {/* Profile Photo Section */}
          <div className="flex items-center gap-4 pb-4 justify-center border-b border-zinc-200 dark:border-zinc-700">
            <ProfilePhoto
              photoUrl={user?.profile_photo_url}
              firstName={user?.first_name}
              lastName={user?.last_name}
              nickname={user?.nickname}
              size="md"
              editable={true}
              onRefreshUser={refreshUser}
              layout="inline"
            />
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            {/* First Name */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                First Name
              </label>
              <input
                id="edit-first-name"
                name="first_name"
                type="text"
                value={formData.first_name}
                onChange={(e) =>
                  setFormData({ ...formData, first_name: e.target.value })
                }
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter first name"
              />
            </div>

            {/* Last Name */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Last Name
              </label>
              <input
                id="edit-last-name"
                name="last_name"
                type="text"
                value={formData.last_name}
                onChange={(e) =>
                  setFormData({ ...formData, last_name: e.target.value })
                }
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter last name"
              />
            </div>

            {/* Nickname */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Nickname <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                id="edit-nickname"
                name="nickname"
                type="text"
                value={formData.nickname}
                onChange={(e) =>
                  setFormData({ ...formData, nickname: e.target.value })
                }
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter nickname"
              />
              <p className="text-xs text-zinc-500 mt-1">
                This will be shown in the welcome message instead of your first
                name.
              </p>
            </div>

            {/* Gender - Dropdown */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Gender
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between">
                  <span className={formData.gender ? "" : "text-zinc-400"}>
                    {getGenderLabel(formData.gender)}
                  </span>
                  <ChevronDown className="w-4 h-4 opacity-50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-[200px]"
                >
                  {genderOptions.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      onClick={() =>
                        setFormData({ ...formData, gender: opt.value })
                      }
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span>{opt.label}</span>
                      {formData.gender === opt.value && (
                        <Check className="w-4 h-4 text-blue-600" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Location
              </label>
              <LocationSelector
                initialValue={{
                  city: formData.city,
                  state: formData.state,
                  country: formData.country,
                }}
                onLocationSelect={(location) => {
                  setFormData({
                    ...formData,
                    city: location.city,
                    state: location.state,
                    state_iso2: location.state_iso2,
                    country: location.country,
                    country_iso2: location.country_iso2,
                    phone_code: location.phone_code,
                  });
                }}
                labelBg="bg-white dark:bg-zinc-900"
              />
            </div>
          </div>
        </div>

        <SheetFooter className="mt-4 flex-row justify-end gap-2">
          <button
            onClick={() => setOpen(false)}
            disabled={isLoading}
            className="px-4 py-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !formData.first_name || !formData.last_name}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
