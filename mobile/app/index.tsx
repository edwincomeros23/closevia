import React, { useState } from 'react';
import { StyleSheet, View, ActivityIndicator, BackHandler, StatusBar, Platform, SafeAreaView } from 'react-native';
import { WebView } from 'react-native-webview';
import { useEffect, useRef } from 'react';

export default function App() {
    const webViewRef = useRef<WebView>(null);
    const [canGoBack, setCanGoBack] = useState(false);
    const [loading, setLoading] = useState(true);

    // Handle Android back button
    useEffect(() => {
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            if (canGoBack && webViewRef.current) {
                webViewRef.current.goBack();
                return true; // Prevent default behavior
            }
            return false; // Let default behavior happen (exit app)
        });

        return () => backHandler.remove();
    }, [canGoBack]);

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

            {loading && (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#2A9D8F" />
                </View>
            )}

            <WebView
                ref={webViewRef}
                source={{ uri: 'https://cloviaph.site' }}
                style={styles.webview}
                onLoadStart={() => setLoading(true)}
                onLoadEnd={() => setLoading(false)}
                onNavigationStateChange={(navState) => {
                    setCanGoBack(navState.canGoBack);
                }}
                // Enable JavaScript
                javaScriptEnabled={true}
                // Enable DOM storage
                domStorageEnabled={true}
                // Start in zoomed out view
                scalesPageToFit={true}
                // Allow mixed content
                mixedContentMode="compatibility"
                // Cache settings
                cacheEnabled={true}
                // Pull to refresh on Android
                pullToRefreshEnabled={true}
                // Allow fullscreen
                allowsFullscreenVideo={true}
                // Media playback
                mediaPlaybackRequiresUserAction={false}
                // Geolocation
                geolocationEnabled={true}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    webview: {
        flex: 1,
    },
    loadingContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
        zIndex: 1,
    },
});
