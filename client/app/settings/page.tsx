"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Settings,
  Save,
  Check,
  Cookie,
  Type,
  Shield,
  FolderCog,
  Eye,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useSettings } from "@/contexts/settings-context";
import { useCookieConsent } from "@/contexts/cookie-consent-context";
import { useAuth } from "@/contexts/auth-context";
import { locationAPI, authAPI } from "@/lib/api";
import type { IndianState, CaseLocationPreference } from "@/types";
import Navigation from "@/components/navigation";

// Add custom styles for animations
import "./settings.css";
import { HexagonBackground } from "@/components/animate-ui/components/backgrounds/hexagon";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/animate-ui/components/radix/sidebar";
import { useLifecycleLogger } from "@/hooks/use-performance-logger";
import { getLogger } from "@/lib/logger";

const logger = getLogger("ui");

// Custom toggle button for sidebar
function SidebarToggleButton() {
  const { state, toggleSidebar } = useSidebar();
  const isOpen = state === "expanded";

  return (
    <button
      onClick={toggleSidebar}
      className="flex items-center justify-center w-full p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-200"
      aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
    >
      {isOpen ? (
        <>
          <ChevronLeft className="h-5 w-5" />
          {/* <span className="ml-2 group-data-[collapsible=icon]:hidden">
            Collapse
          </span> */}
        </>
      ) : (
        <ChevronRight className="h-5 w-5" />
      )}
    </button>
  );
}

export default function SettingsPage() {
  useLifecycleLogger("SettingsPage");

  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const {
    enterKeySubmits,
    setEnterKeySubmits,
    autoExpandTextAreas,
    setAutoExpandTextAreas,
    textSize,
    setTextSize,
    skipArchiveConfirmation,
    setSkipArchiveConfirmation,
    skipDeleteConfirmation,
    setSkipDeleteConfirmation,
  } = useSettings();
  const { consent, openSettings: openCookieSettings } = useCookieConsent();

  // Ref for sections to scroll to
  const accessibilityRef = useRef<HTMLDivElement>(null);
  const privacyRef = useRef<HTMLDivElement>(null);
  const caseManagementRef = useRef<HTMLDivElement>(null);

  // Active section tracking
  const [activeSection, setActiveSection] = useState("accessibility");

  // Local state to track changes before saving
  const [localEnterKeySubmits, setLocalEnterKeySubmits] =
    useState(enterKeySubmits);
  const [localAutoExpandTextAreas, setLocalAutoExpandTextAreas] =
    useState(autoExpandTextAreas);
  const [localTextSize, setLocalTextSize] = useState(textSize);
  const [localSkipArchiveConfirmation, setLocalSkipArchiveConfirmation] =
    useState(skipArchiveConfirmation);
  const [localSkipDeleteConfirmation, setLocalSkipDeleteConfirmation] =
    useState(skipDeleteConfirmation);

  // Case location preference state
  const [caseLocationPreference, setCaseLocationPreference] =
    useState<CaseLocationPreference>("random");
  const [preferredCaseState, setPreferredCaseState] = useState<string>("");
  const [indianStates, setIndianStates] = useState<IndianState[]>([]);
  const [isLoadingStates, setIsLoadingStates] = useState(false);
  const [originalCaseLocationPreference, setOriginalCaseLocationPreference] =
    useState<CaseLocationPreference>("random");
  const [originalPreferredCaseState, setOriginalPreferredCaseState] =
    useState<string>("");

  const [saveMessage, setSaveMessage] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  // Track changes to enable/disable save button
  useEffect(() => {
    const hasUnsavedChanges =
      localEnterKeySubmits !== enterKeySubmits ||
      localAutoExpandTextAreas !== autoExpandTextAreas ||
      localTextSize !== textSize ||
      localSkipArchiveConfirmation !== skipArchiveConfirmation ||
      localSkipDeleteConfirmation !== skipDeleteConfirmation ||
      caseLocationPreference !== originalCaseLocationPreference ||
      preferredCaseState !== originalPreferredCaseState;

    setHasChanges(hasUnsavedChanges);
  }, [
    localEnterKeySubmits,
    localAutoExpandTextAreas,
    localTextSize,
    localSkipArchiveConfirmation,
    localSkipDeleteConfirmation,
    enterKeySubmits,
    autoExpandTextAreas,
    textSize,
    skipArchiveConfirmation,
    skipDeleteConfirmation,
    caseLocationPreference,
    preferredCaseState,
    originalCaseLocationPreference,
    originalPreferredCaseState,
  ]);

  // Load Indian states and user preferences
  useEffect(() => {
    const loadData = async () => {
      if (!isAuthenticated) return;

      // Load Indian states for the dropdown
      setIsLoadingStates(true);
      try {
        const states = await locationAPI.getIndianStates();
        setIndianStates(states);
      } catch (error) {
        logger.error("Failed to load Indian states", error as Error);
      } finally {
        setIsLoadingStates(false);
      }

      // Load user's current preferences
      try {
        const profile = await authAPI.getProfile();
        if (profile.case_location_preference) {
          setCaseLocationPreference(profile.case_location_preference);
          setOriginalCaseLocationPreference(profile.case_location_preference);
        }
        if (profile.preferred_case_state) {
          setPreferredCaseState(profile.preferred_case_state);
          setOriginalPreferredCaseState(profile.preferred_case_state);
        }
      } catch (error) {
        logger.error("Failed to load user preferences", error as Error);
      }
    };

    loadData();
  }, [isAuthenticated]);

  const handleSave = async () => {
    // Update global settings
    setEnterKeySubmits(localEnterKeySubmits);
    setAutoExpandTextAreas(localAutoExpandTextAreas);
    setTextSize(localTextSize);
    setSkipArchiveConfirmation(localSkipArchiveConfirmation);
    setSkipDeleteConfirmation(localSkipDeleteConfirmation);

    // Save case location preference to backend if authenticated
    if (isAuthenticated) {
      try {
        await locationAPI.updateCaseLocationPreference({
          case_location_preference: caseLocationPreference,
          preferred_case_state:
            caseLocationPreference === "specific_state"
              ? preferredCaseState
              : undefined,
        });
        setOriginalCaseLocationPreference(caseLocationPreference);
        setOriginalPreferredCaseState(preferredCaseState);
      } catch (error) {
        logger.error("Failed to save case location preference", error as Error);
      }
    }

    // Show success message
    setSaveMessage("Settings saved successfully!");

    // Clear message after 3 seconds
    setTimeout(() => {
      setSaveMessage("");
    }, 3000);
  };

  // Get text size class based on current setting
  const getTextSizeClass = () => {
    switch (localTextSize) {
      case "small":
        return "text-sm";
      case "large":
        return "text-lg";
      default:
        return "text-base";
    }
  };

  // Scroll to section
  const scrollToSection = (section: string) => {
    setActiveSection(section);
    const refs: Record<string, React.RefObject<HTMLDivElement | null>> = {
      accessibility: accessibilityRef,
      privacy: privacyRef,
      caseManagement: caseManagementRef,
    };
    refs[section]?.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <HexagonBackground className="min-h-screen">
      <Navigation />
      <SidebarProvider defaultOpen={true}>
        <Sidebar variant="inset" collapsible="icon" className="pt-16">
          <SidebarHeader className="pt-4 pb-6">
            <div className="flex items-center gap-2 px-2">
              <Settings className="h-5 w-5 shrink-0" />
              <span className="font-semibold group-data-[collapsible=icon]:hidden">
                Settings
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>General</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeSection === "accessibility"}
                    onClick={() => scrollToSection("accessibility")}
                    tooltip="Accessibility"
                  >
                    <Type className="h-4 w-4" />
                    <span>Accessibility</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeSection === "privacy"}
                    onClick={() => scrollToSection("privacy")}
                    tooltip="Privacy"
                  >
                    <Shield className="h-4 w-4" />
                    <span>Privacy</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>

            {isAuthenticated && (
              <SidebarGroup>
                <SidebarGroupLabel>Advanced</SidebarGroupLabel>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeSection === "caseManagement"}
                      onClick={() => scrollToSection("caseManagement")}
                      tooltip="Case Management"
                    >
                      <FolderCog className="h-4 w-4" />
                      <span>Case Management</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            )}
          </SidebarContent>
          <SidebarFooter>
            <SidebarToggleButton />
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="pt-16">
          <div className="max-w-4xl mx-auto p-6">
            {/* ============================================ */}
            {/* ACCESSIBILITY SETTINGS - Visible to Everyone */}
            {/* ============================================ */}
            <div
              ref={accessibilityRef}
              id="accessibility"
              className="bg-white dark:bg-zinc-800 rounded-lg shadow-md p-6 mb-6 transition-all duration-200 scroll-mt-24"
            >
              <h2 className="text-xl font-semibold mb-4 border-b pb-2 dark:border-zinc-700 flex items-center gap-2">
                <Type className="h-5 w-5 text-blue-600" />
                Accessibility Settings
              </h2>

              {/* Text Size */}
              <div className="mb-8">
                <h3 className="text-lg font-medium mb-2 text-blue-600 dark:text-blue-400">
                  Text Size
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  Adjust the size of text throughout the application
                </p>
                <div className="flex flex-wrap gap-3 pl-2">
                  <label className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                    <input
                      type="radio"
                      name="textSize"
                      checked={localTextSize === "small"}
                      onChange={() => setLocalTextSize("small")}
                      className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium">Small</span>
                  </label>
                  <label className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                    <input
                      type="radio"
                      name="textSize"
                      checked={localTextSize === "medium"}
                      onChange={() => setLocalTextSize("medium")}
                      className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-base font-medium">Medium</span>
                  </label>
                  <label className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                    <input
                      type="radio"
                      name="textSize"
                      checked={localTextSize === "large"}
                      onChange={() => setLocalTextSize("large")}
                      className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-lg font-medium">Large</span>
                  </label>
                </div>
              </div>

              {/* Preview Section */}
              <div className="mb-4">
                <h3 className="text-lg font-medium mb-2 text-blue-600 dark:text-blue-400 flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Preview
                </h3>
                <p className={`mb-4 ${getTextSizeClass()}`}>
                  This text will appear at the selected size throughout the
                  application.
                </p>
                <div className="border dark:border-zinc-700 p-5 rounded-lg bg-gray-50 dark:bg-zinc-900 shadow-inner">
                  <p
                    className={`mb-3 font-medium ${getTextSizeClass()} text-blue-600 dark:text-blue-400`}
                  >
                    Sample Argument
                  </p>
                  <p className={getTextSizeClass()}>
                    The plaintiff argues that the defendant breached the
                    contract by failing to deliver the goods on time. This
                    caused significant financial damage to the plaintiff's
                    business operations.
                  </p>
                </div>
              </div>

              {/* Save Button for Text Size */}
              {localTextSize !== textSize && (
                <div className="mt-6 pt-4 border-t dark:border-zinc-700">
                  <button
                    onClick={() => setTextSize(localTextSize)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg flex items-center transition-all duration-200 transform hover:scale-105 active:scale-95"
                  >
                    <Save className="h-5 w-5 mr-2" />
                    Save Text Size
                  </button>
                </div>
              )}
            </div>

            {/* ====================================== */}
            {/* PRIVACY SETTINGS - Visible to Everyone */}
            {/* ====================================== */}
            <div
              ref={privacyRef}
              id="privacy"
              className="bg-white dark:bg-zinc-800 rounded-lg shadow-md p-6 mb-6 transition-all duration-200 scroll-mt-24"
            >
              <h2 className="text-xl font-semibold mb-4 border-b pb-2 dark:border-zinc-700 flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                Privacy Settings
              </h2>

              <div className="mb-6">
                <h3 className="text-lg font-medium mb-2 text-blue-600 dark:text-blue-400">
                  Cookie Preferences
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  Control how we use cookies to personalize your experience and
                  analyze site usage.
                </p>

                {/* Current Consent Status */}
                <div className="bg-gray-50 dark:bg-zinc-900 rounded-lg p-4 mb-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Current Cookie Consent:
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          consent.essential ? "bg-green-500" : "bg-red-500"
                        }`}
                      />
                      <span className="text-gray-600 dark:text-gray-400">
                        Essential: Always On
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          consent.functional ? "bg-green-500" : "bg-red-500"
                        }`}
                      />
                      <span className="text-gray-600 dark:text-gray-400">
                        Functional: {consent.functional ? "On" : "Off"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          consent.analytics ? "bg-green-500" : "bg-red-500"
                        }`}
                      />
                      <span className="text-gray-600 dark:text-gray-400">
                        Analytics: {consent.analytics ? "On" : "Off"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          consent.marketing ? "bg-green-500" : "bg-red-500"
                        }`}
                      />
                      <span className="text-gray-600 dark:text-gray-400">
                        Marketing: {consent.marketing ? "On" : "Off"}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={openCookieSettings}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-600 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
                >
                  <Cookie className="h-4 w-4" />
                  <span>Manage Cookie Preferences</span>
                </button>
              </div>
            </div>

            {/* ============================================== */}
            {/* CASE MANAGEMENT SETTINGS - Only for Logged In */}
            {/* ============================================== */}
            {isAuthenticated && (
              <div
                ref={caseManagementRef}
                id="case-management"
                className="bg-white dark:bg-zinc-800 rounded-lg shadow-md p-6 mb-6 transition-all duration-200 scroll-mt-24"
              >
                <h2 className="text-xl font-semibold mb-4 border-b pb-2 dark:border-zinc-700 flex items-center gap-2">
                  <FolderCog className="h-5 w-5 text-blue-600" />
                  Case Management Settings
                </h2>

                {/* Enter Key Behavior */}
                <div className="mb-8">
                  <h3 className="text-lg font-medium mb-2 text-blue-600 dark:text-blue-400">
                    Enter Key Behavior
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    Control how the Enter key works when typing arguments
                  </p>
                  <div className="space-y-3 pl-2">
                    <label className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                      <input
                        type="radio"
                        name="enterKeyBehavior"
                        checked={localEnterKeySubmits}
                        onChange={() => setLocalEnterKeySubmits(true)}
                        className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className={`${getTextSizeClass()} font-medium`}>
                        Submit on Enter{" "}
                        <span className="text-gray-500 dark:text-gray-400 font-normal">
                          (use Shift+Enter for new line)
                        </span>
                      </span>
                    </label>
                    <label className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                      <input
                        type="radio"
                        name="enterKeyBehavior"
                        checked={!localEnterKeySubmits}
                        onChange={() => setLocalEnterKeySubmits(false)}
                        className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className={`${getTextSizeClass()} font-medium`}>
                        New line on Enter{" "}
                        <span className="text-gray-500 dark:text-gray-400 font-normal">
                          (use Ctrl+Enter to submit)
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

                {/* Auto-expand Text Areas */}
                <div className="mb-8">
                  <h3 className="text-lg font-medium mb-2 text-blue-600 dark:text-blue-400">
                    Text Area Behavior
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    Control how text areas behave when typing long arguments
                  </p>
                  <label className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localAutoExpandTextAreas}
                      onChange={() =>
                        setLocalAutoExpandTextAreas(!localAutoExpandTextAreas)
                      }
                      className="mr-3 h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className={`${getTextSizeClass()} font-medium`}>
                      Auto-expand text areas for long arguments
                    </span>
                  </label>
                </div>

                {/* Confirmation Preferences */}
                <div className="mb-8">
                  <h3 className="text-lg font-medium mb-2 text-blue-600 dark:text-blue-400">
                    Confirmation Dialogs
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    Skip confirmation dialogs for faster workflow (for power
                    users)
                  </p>
                  <div className="space-y-3">
                    <label className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={localSkipArchiveConfirmation}
                        onChange={() =>
                          setLocalSkipArchiveConfirmation(
                            !localSkipArchiveConfirmation
                          )
                        }
                        className="mr-3 h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className={`${getTextSizeClass()} font-medium`}>
                        Skip confirmation when archiving cases
                      </span>
                    </label>
                    <label className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={localSkipDeleteConfirmation}
                        onChange={() =>
                          setLocalSkipDeleteConfirmation(
                            !localSkipDeleteConfirmation
                          )
                        }
                        className="mr-3 h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className={`${getTextSizeClass()} font-medium`}>
                        Skip confirmation when permanently deleting cases
                      </span>
                    </label>
                  </div>
                </div>

                {/* Case Location Preference Section */}
                <div className="mb-8">
                  <h3 className="text-lg font-medium mb-2 text-blue-600 dark:text-blue-400">
                    Case Generation Location
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    Choose which High Court jurisdiction to use when generating
                    new cases
                  </p>
                  <div className="space-y-3">
                    <label className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                      <input
                        type="radio"
                        name="caseLocation"
                        value="random"
                        checked={caseLocationPreference === "random"}
                        onChange={() => setCaseLocationPreference("random")}
                        className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <span
                          className={`${getTextSizeClass()} font-medium block`}
                        >
                          Random High Court
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Cases will be assigned to a random Indian High Court
                        </span>
                      </div>
                    </label>
                    <label className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                      <input
                        type="radio"
                        name="caseLocation"
                        value="user_location"
                        checked={caseLocationPreference === "user_location"}
                        onChange={() =>
                          setCaseLocationPreference("user_location")
                        }
                        className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <span
                          className={`${getTextSizeClass()} font-medium block`}
                        >
                          My Location
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Uses the location from your profile
                        </span>
                      </div>
                    </label>
                    <label className="flex items-center p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer">
                      <input
                        type="radio"
                        name="caseLocation"
                        value="specific_state"
                        checked={caseLocationPreference === "specific_state"}
                        onChange={() =>
                          setCaseLocationPreference("specific_state")
                        }
                        className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <span
                          className={`${getTextSizeClass()} font-medium block`}
                        >
                          Specific State
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Always use a specific Indian state&apos;s High Court
                        </span>
                      </div>
                    </label>

                    {/* State Dropdown - shown when specific_state is selected */}
                    {caseLocationPreference === "specific_state" && (
                      <div className="ml-7 mt-2">
                        <select
                          value={preferredCaseState}
                          onChange={(e) =>
                            setPreferredCaseState(e.target.value)
                          }
                          className="w-full md:w-1/2 p-3 border-2 rounded-lg border-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white focus:border-blue-500 focus:outline-none"
                        >
                          <option value="">Select a state...</option>
                          {indianStates.map((state) => (
                            <option
                              key={state.state_iso2}
                              value={state.state_iso2}
                            >
                              {state.state_name} - {state.high_court}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex items-center justify-between mt-8 pt-4 border-t dark:border-zinc-700">
                  <button
                    onClick={handleSave}
                    disabled={!hasChanges}
                    className={`${
                      hasChanges
                        ? "bg-blue-600 hover:bg-blue-700"
                        : "bg-gray-400 cursor-not-allowed"
                    } text-white font-bold py-2 px-6 rounded-lg flex items-center transition-all duration-200 transform hover:scale-105 active:scale-95`}
                  >
                    {saveMessage ? (
                      <>
                        <Check className="h-5 w-5 mr-2" />
                        Saved
                      </>
                    ) : (
                      <>
                        <Save className="h-5 w-5 mr-2" />
                        Save Settings
                      </>
                    )}
                  </button>

                  {saveMessage && (
                    <span className="text-green-600 dark:text-green-400 ml-4 font-medium animate-fadeIn">
                      {saveMessage}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Message for logged out users */}
            {!isAuthenticated && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
                <p className="text-blue-700 dark:text-blue-300">
                  <a
                    href="/login"
                    className="underline font-medium hover:text-blue-800 dark:hover:text-blue-200"
                  >
                    Log in
                  </a>{" "}
                  to access additional settings like case management
                  preferences.
                </p>
              </div>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </HexagonBackground>
  );
}
