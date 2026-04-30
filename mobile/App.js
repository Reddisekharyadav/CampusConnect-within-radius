import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  RefreshControl,
  SafeAreaView,
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
import { fetchNearbyUsers, updateLocation, BASE_URL } from "./src/services/api";

const PROFILE_KEY = "campusradius_profile";
const LOCATION_TICK_MS = 15000;

export default function App() {
  const [permissionState, setPermissionState] = useState("checking");
  const [screen, setScreen] = useState("permission");
  const [profile, setProfile] = useState({ username: "", bio: "" });
  const [isVisible, setIsVisible] = useState(false);
  const [radius, setRadius] = useState(100);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [appState, setAppState] = useState(AppState.currentState);
  const intervalRef = useRef(null);

  const canRunLiveUpdates = useMemo(() => {
    return (
      appState === "active" &&
      permissionState === "granted" &&
      Boolean(profile.username.trim())
    );
  }, [appState, permissionState, profile.username]);

  const loadSavedProfile = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(PROFILE_KEY);
      if (!saved) {
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
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });

    const coords = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude
    };

    setCurrentLocation(coords);
    return coords;
  }, []);

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

        const coords = await getCurrentCoords();

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

  const saveProfile = useCallback(async () => {
    if (!profile.username.trim()) {
      Alert.alert("Username required", "Please enter a username to continue.");
      return;
    }

    try {
      const cleanProfile = {
        username: profile.username.trim(),
        bio: profile.bio.trim()
      };
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(cleanProfile));
      setProfile(cleanProfile);
      setScreen("main");
    } catch (error) {
      console.warn("Failed to save profile", error);
      Alert.alert("Save failed", "Could not save profile locally.");
    }
  }, [profile]);

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
    if (screen === "main" && permissionState === "granted") {
      syncAndFetch();
    }
  }, [isVisible, radius, permissionState, screen, syncAndFetch]);

  const renderPermissionScreen = () => (
    <View style={styles.card}>
      <Text style={styles.title}>Welcome to CampusRadius</Text>
      <Text style={styles.subtitle}>
        We use your location only to show nearby users. No background tracking.
      </Text>
      <TouchableOpacity style={styles.primaryButton} onPress={requestPermissionAndContinue}>
        <Text style={styles.primaryButtonText}>Continue</Text>
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
      <Text style={styles.userName}>{item.username}</Text>
      <Text style={styles.userBio}>{item.bio || "No bio"}</Text>
      <Text style={styles.userDistance}>{item.distance} m away</Text>
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

        {currentLocation ? (
          <Text style={styles.locationText}>
            You: {currentLocation.latitude.toFixed(5)}, {currentLocation.longitude.toFixed(5)}
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
  primaryButtonText: {
    color: "#ffffff",
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
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#dde5ff"
  },
  userName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1f2a44"
  },
  userBio: {
    marginTop: 2,
    fontSize: 14,
    color: "#516082"
  },
  userDistance: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
    color: "#2962ff"
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
  }
});
