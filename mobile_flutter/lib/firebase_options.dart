// Generated manually from google-services.json and GoogleService-Info.plist
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        return ios;
      default:
        return android;
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyBUxzNGmRdOrP0AKVTib4zp68JfMUQlJ1Q',
    appId: '1:763299778868:android:ee4e68b27949de1506d561',
    messagingSenderId: '763299778868',
    projectId: 'notiflow-480919-11ee8',
    storageBucket: 'notiflow-480919-11ee8.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyCrzGWussCRYsJllTkR5v1-IVpMSOdnkAM',
    appId: '1:763299778868:ios:cba584da986935d106d561',
    messagingSenderId: '763299778868',
    projectId: 'notiflow-480919-11ee8',
    storageBucket: 'notiflow-480919-11ee8.firebasestorage.app',
    iosBundleId: 'cl.notiflow.app',
  );
}
