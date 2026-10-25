import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Linking,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import Slider from "@react-native-community/slider";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import {
  acceptWave,
  blockUser,
  clearSessionToken,
  declineWave,
  deleteAccount,
  fetchNearbyUsers,
  getSessionToken,
  getWaves,
  loginAccount,
  logoutAccount,
  registerAccount,
  reportUser,
  sendChatMessage,
  sendWave,
  setSessionToken,
  snapCoordinate,
  updateLocation,
  BASE_URL
} from "./src/services/api";

const PROFILE_KEY = "campusradius_profile";
const LOCATION_TICK_MS = 15000;
const DEMO_COORDS = {
  latitude: 17.385,
  longitude: 78.4867
};

export default function App() {
  const [permissionState, setPermissionState] = useState("checking");
  const [screen, setScreen] = useState("permission");
  const [profile, setProfile] = useState({ username: "", bio: "" });
  const [password, setPassword] = useState("");
  const [reportTarget, setReportTarget] = useState(null);
  const [reportReason, setReportReason] = useState("");
  const [waves, setWaves] = useState([]);
  const [wavesOpen, setWavesOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [radius, setRadius] = useState(100);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationMode, setLocationMode] = useState("real");
  const [appState, setAppState] = useState(AppState.currentState);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: "assistant", content: "Hi, I can help you find nearby users and explain visibility settings." }
  ]);
  const intervalRef = useRef(null);

  const canRunLiveUpdates = useMemo(() => {
    return (
      appState === "active" &&
      (permissionState === "granted" || locationMode === "demo") &&
      Boolean(profile.username.trim())
    );
  }, [appState, locationMode, permissionState, profile.username]);

  const loadSavedProfile = useCallback(async () => {
    try {
      // No session token means the protected endpoints will 401, so a
      // saved username alone is not enough to enter the main screen.
      const token = await getSessionToken();
      const saved = await AsyncStorage.getItem(PROFILE_KEY);
      if (!saved || !token) {
        setScreen("profile");
        return;
      }

      const parsed = JSON.parse(saved);
      if (parsed?.username) {
        setProfile({ username: parsed.username, bio: parsed.bio || "" });
        setScreen("main");
      } else {
        setScreen("profile");
      }
    } catch (error) {
      console.warn("Failed to read saved profile", error);
      setScreen("profile");
    }
  }, []);

  const getCurrentCoords = useCallback(async () => {
    if (locationMode === "demo") {
      setCurrentLocation(DEMO_COORDS);
      return DEMO_COORDS;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });

    const coords = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude
    };

    setCurrentLocation(coords);
    return coords;
  }, [locationMode]);

  const syncAndFetch = useCallback(
    async (isManualRefresh = false) => {
      if (!profile.username.trim()) {
        return;
      }

      try {
        if (isManualRefresh) {
          setRefreshing(true);
        } else {
          setLoadingNearby(true);
        }

        setErrorMessage("");

        const rawCoords = await getCurrentCoords();
        // Client-side blur: snap to the ~100 m grid BEFORE upload.
        const coords = {
          latitude: snapCoordinate(rawCoords.latitude),
          longitude: snapCoordinate(rawCoords.longitude)
        };

        await updateLocation({
          username: profile.username.trim(),
          bio: profile.bio.trim(),
          latitude: coords.latitude,
          longitude: coords.longitude,
          radius,
          isVisible
        });

        const users = await fetchNearbyUsers({
          username: profile.username.trim(),
          latitude: coords.latitude,
          longitude: coords.longitude,
          radius
        });

        setNearbyUsers(Array.isArray(users) ? users : []);
      } catch (error) {
        // A 401 means the session expired or was cleared server-side:
        // drop back to sign-in instead of retrying unauthenticated calls.
        if (error?.response?.status === 401) {
          await clearSessionToken();
          setScreen("profile");
          setErrorMessage("Your session expired. Please sign in again.");
          return;
        }
        setErrorMessage(
          error?.response?.data?.error ||
            "Unable to reach server. Check network and API URL."
        );
      } finally {
        setLoadingNearby(false);
        setRefreshing(false);
      }
    },
    [getCurrentCoords, isVisible, profile.bio, profile.username, radius]
  );

  const sendChat = useCallback(async () => {
    const prompt = chatInput.trim();
    if (!prompt) return;

    setChatMessages((current) => [...current, { role: "user", content: prompt }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await sendChatMessage({
        message: prompt,
        username: profile.username.trim(),
        bio: profile.bio.trim(),
        nearbyUsers
      });

      setChatMessages((current) => [...current, { role: "assistant", content: response.reply }]);
    } catch (error) {
      console.warn("Chat request failed", error);
      setChatMessages((current) => [
        ...current,
        { role: "assistant", content: "The chatbot is unavailable right now. Please try again." }
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, nearbyUsers, profile.bio, profile.username]);

  const requestPermissionAndContinue = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionState(status);

      if (status !== "granted") {
        Alert.alert(
          "Permission required",
          "Location access is required to discover nearby users."
        );
        return;
      }

      await getCurrentCoords();
      await loadSavedProfile();
    } catch (error) {
      console.warn("Permission request failed", error);
      setPermissionState("denied");
      setErrorMessage("Failed to request location permission.");
    }
  }, [getCurrentCoords, loadSavedProfile]);

  const continueWithDemoLocation = useCallback(async () => {
    setLocationMode("demo");
    setPermissionState("demo");
    setCurrentLocation(DEMO_COORDS);
    await loadSavedProfile();
  }, [loadSavedProfile]);

  // Sign-in: register a new username, or log in when it already exists
  // (409). The session token — never the password — is stored for later
  // calls, and sent as Authorization: Bearer by the API interceptor.
  const saveProfile = useCallback(async () => {
    if (!profile.username.trim()) {
      Alert.alert("Username required", "Please enter a username to continue.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Password required", "Choose a password of at least 8 characters.");
      return;
    }

    try {
      const cleanProfile = {
        username: profile.username.trim(),
        bio: profile.bio.trim()
      };
      let auth;
      try {
        auth = await registerAccount(cleanProfile.username, password, cleanProfile.bio);
      } catch (registerError) {
        if (registerError?.response?.status === 409) {
          auth = await loginAccount(cleanProfile.username, password);
        } else {
          throw registerError;
        }
      }
      await setSessionToken(auth.token);
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(cleanProfile));
      setProfile(cleanProfile);
      setPassword("");
      setScreen("main");
    } catch (error) {
      console.warn("Sign-in failed", error);
      Alert.alert(
        "Sign-in failed",
        error?.response?.data?.error || "Could not sign in. Check the API URL and try again."
      );
    }
  }, [profile, password]);

  const signOut = useCallback(async () => {
    try { await logoutAccount(); } catch { /* local cleanup still runs */ }
    try { await AsyncStorage.removeItem(PROFILE_KEY); } catch { /* ignore */ }
    setProfile({ username: "", bio: "" });
    setPassword("");
    setNearbyUsers([]);
    setScreen("permission");
  }, []);

  const deleteMyAccount = useCallback(() => {
    Alert.alert(
      "Delete account?",
      "This permanently removes your profile, location, blocks, waves, messages, and reports.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount();
            } catch (error) {
              Alert.alert("Delete failed", error?.response?.data?.error || "Could not delete your account.");
              return;
            }
            try { await AsyncStorage.removeItem(PROFILE_KEY); } catch { /* ignore */ }
            setProfile({ username: "", bio: "" });
            setPassword("");
            setNearbyUsers([]);
            setScreen("permission");
          }
        }
      ]
    );
  }, []);

  const handleBlockUser = useCallback(async (targetUsername) => {
    try {
      await blockUser(targetUsername);
      setNearbyUsers((current) => current.filter((u) => u.username !== targetUsername));
    } catch (error) {
      Alert.alert("Block failed", error?.response?.data?.error || "Could not block that user.");
    }
  }, []);

  const submitReport = useCallback(async () => {
    if (!reportTarget || reportReason.trim().length < 10) {
      Alert.alert("Report needs a reason", "Please explain in at least 10 characters.");
      return;
    }
    try {
      await reportUser(reportTarget, reportReason.trim());
      setReportTarget(null);
      setReportReason("");
      Alert.alert("Reported", "Your report was submitted privately. It is never published.");
    } catch (error) {
      Alert.alert("Report failed", error?.response?.data?.error || "Could not submit the report.");
    }
  }, [reportTarget, reportReason]);

  const handleWaveUser = useCallback(async (targetUsername) => {
    try {
      await sendWave(targetUsername);
      Alert.alert("Wave sent", `You waved at @${targetUsername}. They must accept before you can message each other.`);
    } catch (error) {
      Alert.alert("Wave failed", error?.response?.data?.error || "Could not send that wave.");
    }
  }, []);

  const openWaves = useCallback(async () => {
    try {
      const data = await getWaves();
      setWaves(Array.isArray(data) ? data : (data?.waves || []));
    } catch {
      setWaves([]);
    }
    setWavesOpen(true);
  }, []);

  const handleWaveDecision = useCallback(async (fromUsername, accept) => {
    try {
      if (accept) {
        await acceptWave(fromUsername);
        Alert.alert("Matched", `You matched with @${fromUsername}. You can now message each other.`);
      } else {
        await declineWave(fromUsername);
      }
      setWaves((current) => current.filter((w) => !(w.fromUsername === fromUsername && w.status === "pending")));
    } catch (error) {
      Alert.alert("Wave failed", error?.response?.data?.error || "Could not update that wave.");
    }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!canRunLiveUpdates || screen !== "main") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    syncAndFetch();

    intervalRef.current = setInterval(() => {
      syncAndFetch();
    }, LOCATION_TICK_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [canRunLiveUpdates, screen, syncAndFetch]);

  useEffect(() => {
    if (screen === "main" && (permissionState === "granted" || locationMode === "demo")) {
      syncAndFetch();
    }
  }, [isVisible, locationMode, radius, permissionState, screen, syncAndFetch]);

  const openUrl = useCallback(async (url) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (error) {
      Alert.alert("Could not open link", "Please try again later.");
    }
  }, []);

  const renderPermissionScreen = () => (
    <View style={styles.card}>
      <Text style={styles.title}>Welcome to CampusRadius</Text>
      <Text style={styles.subtitle}>
        We use your location only to show nearby users. No background tracking.
      </Text>
      <TouchableOpacity style={styles.primaryButton} onPress={requestPermissionAndContinue}>
        <Text style={styles.primaryButtonText}>Continue</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={continueWithDemoLocation}>
        <Text style={styles.secondaryButtonText}>Use demo location</Text>
      </TouchableOpacity>
      {permissionState === "denied" ? (
        <Text style={styles.errorText}>Location permission denied. Enable it in settings.</Text>
      ) : null}
    </View>
  );

  const renderProfileSetup = () => (
    <View style={styles.card}>
      <Text style={styles.title}>Profile Setup</Text>
      <TextInput
        placeholder="Username"
        style={styles.input}
        value={profile.username}
        onChangeText={(text) => setProfile((prev) => ({ ...prev, username: text }))}
        autoCapitalize="none"
      />
      <TextInput
        placeholder="Password (at least 8 characters)"
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />
      <Text style={styles.subtitle}>
        New username? This creates your account. Existing username? This password signs you in.
        Passwords are hashed on the server and never stored on this phone.
      </Text>
      <TextInput
        placeholder="Bio"
        style={[styles.input, styles.bioInput]}
        value={profile.bio}
        onChangeText={(text) => setProfile((prev) => ({ ...prev, bio: text }))}
        multiline
      />
      <TouchableOpacity style={styles.primaryButton} onPress={saveProfile}>
        <Text style={styles.primaryButtonText}>Save</Text>
      </TouchableOpacity>
    </View>
  );

  const renderUserItem = ({ item }) => (
    <View style={styles.userCard}>
      <View style={styles.userHeader}>
        <View style={styles.userTitleBlock}>
          <Text style={styles.userName}>{item.fullName || item.username}</Text>
          <Text style={styles.userHandle}>@{item.username}</Text>
        </View>
        <Text style={styles.userDistance}>{item.distance} m</Text>
      </View>
      <Text style={styles.userBio}>{item.bio || "No bio"}</Text>
      {item.course ? <Text style={styles.userCourse}>{item.course}</Text> : null}
      {Array.isArray(item.interests) && item.interests.length ? (
        <View style={styles.tagRow}>
          {item.interests.map((interest) => (
            <Text key={interest} style={styles.tag}>
              {interest}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.socialRow}>
        <TouchableOpacity style={styles.socialButton} onPress={() => handleWaveUser(item.username)}>
          <Text style={styles.socialText}>👋 Wave</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.socialButton} onPress={() => handleBlockUser(item.username)}>
          <Text style={styles.socialText}>Block</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.socialButton}
          onPress={() => { setReportTarget(item.username); setReportReason(""); }}
        >
          <Text style={styles.socialText}>Report</Text>
        </TouchableOpacity>
      </View>
      {item.instagram || item.facebook ? (
        <View style={styles.socialRow}>
          {item.instagram ? (
            <TouchableOpacity
              style={styles.socialButton}
              onPress={() => openUrl(`https://instagram.com/${item.instagram.replace(/^@/, "")}`)}
            >
              <Text style={styles.socialText}>Instagram {item.instagram}</Text>
            </TouchableOpacity>
          ) : null}
          {item.facebook ? (
            <TouchableOpacity style={styles.socialButton} onPress={() => openUrl(item.facebook)}>
              <Text style={styles.socialText}>Facebook</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const renderMainScreen = () => (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Hello, {profile.username}</Text>
        <Text style={styles.baseUrlText}>API: {BASE_URL}</Text>

        <View style={styles.rowBetween}>
          <Text style={styles.label}>Visible to nearby users</Text>
          <Switch value={isVisible} onValueChange={setIsVisible} />
        </View>

        <Text style={styles.label}>Radius: {Math.round(radius)} m</Text>
        <Slider
          minimumValue={10}
          maximumValue={500}
          step={10}
          value={radius}
          onValueChange={setRadius}
          minimumTrackTintColor="#2962ff"
          maximumTrackTintColor="#ccd7ff"
          thumbTintColor="#2962ff"
        />

        <TouchableOpacity style={styles.primaryButton} onPress={() => syncAndFetch(true)}>
          <Text style={styles.primaryButtonText}>Refresh</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => setChatOpen(true)}>
          <Text style={styles.secondaryButtonText}>Ask AI</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={openWaves}>
          <Text style={styles.secondaryButtonText}>Waves waiting for you</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={signOut}>
          <Text style={styles.secondaryButtonText}>Sign out</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={deleteMyAccount}>
          <Text style={styles.secondaryButtonText}>Delete account</Text>
        </TouchableOpacity>

        {currentLocation ? (
          <Text style={styles.locationText}>
            {locationMode === "demo" ? "Demo" : "You"}: {currentLocation.latitude.toFixed(5)}, {currentLocation.longitude.toFixed(5)}
          </Text>
        ) : null}

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>

      {loadingNearby ? (
        <ActivityIndicator size="large" color="#2962ff" style={styles.loader} />
      ) : null}

      <FlatList
        data={nearbyUsers}
        keyExtractor={(item, index) => `${item.username}-${index}`}
        renderItem={renderUserItem}
        ListEmptyComponent={<Text style={styles.emptyText}>No users nearby</Text>}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => syncAndFetch(true)} />
        }
        contentContainerStyle={styles.listContent}
      />

      <Modal visible={chatOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.title}>Campus AI</Text>
              <TouchableOpacity onPress={() => setChatOpen(false)}>
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.chatLog} contentContainerStyle={styles.chatLogContent}>
              {chatMessages.map((entry, index) => (
                <View key={`${entry.role}-${index}`} style={entry.role === "user" ? styles.userBubble : styles.assistantBubble}>
                  <Text style={entry.role === "user" ? styles.userChatText : styles.chatText}>{entry.content}</Text>
                </View>
              ))}
            </ScrollView>

            <TextInput
              style={[styles.input, styles.chatInput]}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Ask about nearby users or privacy"
              multiline
            />
            <TouchableOpacity style={styles.primaryButton} onPress={sendChat} disabled={chatLoading}>
              <Text style={styles.primaryButtonText}>{chatLoading ? "Thinking..." : "Send"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={reportTarget !== null} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.title}>Report @{reportTarget}</Text>
            <Text style={styles.subtitle}>Reports are private and never published. At least 10 characters.</Text>
            <TextInput
              style={[styles.input, styles.chatInput]}
              value={reportReason}
              onChangeText={setReportReason}
              placeholder="Why are you reporting this user?"
              multiline
            />
            <TouchableOpacity style={styles.primaryButton} onPress={submitReport}>
              <Text style={styles.primaryButtonText}>Submit report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => { setReportTarget(null); setReportReason(""); }}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={wavesOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.title}>Waves</Text>
              <TouchableOpacity onPress={() => setWavesOpen(false)}>
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </View>
            {waves.filter((w) => w.toUsername === profile.username && w.status === "pending").length === 0 ? (
              <Text style={styles.subtitle}>No incoming waves right now.</Text>
            ) : (
              waves
                .filter((w) => w.toUsername === profile.username && w.status === "pending")
                .map((w) => (
                  <View key={w.fromUsername} style={styles.userCard}>
                    <Text style={styles.userName}>@{w.fromUsername} waved at you.</Text>
                    <View style={styles.socialRow}>
                      <TouchableOpacity style={styles.socialButton} onPress={() => handleWaveDecision(w.fromUsername, true)}>
                        <Text style={styles.socialText}>Accept — match</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.socialButton} onPress={() => handleWaveDecision(w.fromUsername, false)}>
                        <Text style={styles.socialText}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
            )}
          </View>
        </View>
      </Modal>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {screen === "permission" && renderPermissionScreen()}
      {screen === "profile" && renderProfileSetup()}
      {screen === "main" && renderMainScreen()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#eef3ff"
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8
  },
  card: {
    backgroundColor: "#ffffff",
    margin: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1f2a44",
    marginBottom: 12
  },
  subtitle: {
    fontSize: 15,
    color: "#465173",
    marginBottom: 18,
    lineHeight: 22
  },
  input: {
    borderWidth: 1,
    borderColor: "#d4dcf7",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: "#f8faff"
  },
  bioInput: {
    minHeight: 88,
    textAlignVertical: "top"
  },
  primaryButton: {
    backgroundColor: "#2962ff",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 6
  },
  secondaryButton: {
    backgroundColor: "#e6edff",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 10
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700"
  },
  secondaryButtonText: {
    color: "#1e3a8a",
    fontSize: 16,
    fontWeight: "700"
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8
  },
  label: {
    fontSize: 15,
    color: "#344266",
    fontWeight: "600",
    marginBottom: 6
  },
  locationText: {
    marginTop: 10,
    fontSize: 12,
    color: "#6a7390"
  },
  userCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#dde5ff"
  },
  userHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "flex-start"
  },
  userTitleBlock: {
    flex: 1
  },
  userName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1f2a44"
  },
  userHandle: {
    marginTop: 2,
    fontSize: 12,
    color: "#66708f"
  },
  userBio: {
    marginTop: 8,
    fontSize: 14,
    color: "#516082",
    lineHeight: 20
  },
  userDistance: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2962ff",
    flexShrink: 0
  },
  userCourse: {
    marginTop: 8,
    fontSize: 13,
    color: "#344266",
    fontWeight: "700"
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10
  },
  tag: {
    borderWidth: 1,
    borderColor: "#bfd0ff",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#eef3ff",
    color: "#1e3a8a",
    fontSize: 12,
    fontWeight: "700"
  },
  socialRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  socialButton: {
    borderRadius: 10,
    backgroundColor: "#e6edff",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  socialText: {
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "700"
  },
  emptyText: {
    textAlign: "center",
    color: "#66708f",
    marginTop: 22,
    fontSize: 16
  },
  errorText: {
    marginTop: 10,
    color: "#c62828",
    fontSize: 14
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    flexGrow: 1
  },
  loader: {
    marginVertical: 12
  },
  baseUrlText: {
    fontSize: 12,
    color: "#7b88ac",
    marginBottom: 12
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end"
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: "85%"
  },
  closeText: {
    color: "#2962ff",
    fontWeight: "700"
  },
  chatLog: {
    marginTop: 10,
    maxHeight: 260
  },
  chatLogContent: {
    gap: 10,
    paddingBottom: 10
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#2962ff",
    padding: 10,
    borderRadius: 12,
    maxWidth: "88%"
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#eef3ff",
    padding: 10,
    borderRadius: 12,
    maxWidth: "88%"
  },
  chatText: {
    color: "#0f172a"
  },
  userChatText: {
    color: "#ffffff"
  },
  chatInput: {
    minHeight: 80,
    marginTop: 8
  }
});
