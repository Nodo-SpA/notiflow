import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:app_settings/app_settings.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest.dart' as tz;
import 'package:timezone/timezone.dart' as tz;
import 'firebase_options.dart';

const String apiBase = 'https://notiflow-backend-179964029864.us-central1.run.app';
const Color kPrimary = Color(0xFFFF6B00); // naranjo principal del logo
const Color kSecondary = Color(0xFF0B1727); // gris azulado profundo
const Color kAccent = Color(0xFFF7F8FA); // gris claro minimal
const Color kGlow = Color(0xFF7CC6FF); // azul suave para acentos
const Color kSurface = Colors.white; // superficies blancas y limpias
const Duration kTimeout = Duration(seconds: 15);

final FlutterLocalNotificationsPlugin localNotifications = FlutterLocalNotificationsPlugin();
final Set<String> _registeringTokens = <String>{};
const List<Duration> _registerRetryDelays = [
  Duration(seconds: 1),
  Duration(seconds: 3),
  Duration(seconds: 7),
];

Future<String?> _refreshAuthTokenFromPrefs() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final refreshToken = prefs.getString('refreshToken');
    if (refreshToken == null || refreshToken.isEmpty) return null;
    final res = await http
        .post(
          Uri.parse('$apiBase/auth/refresh'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'refreshToken': refreshToken}),
        )
        .timeout(kTimeout);
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      final newToken = data['token'] as String?;
      final newRefresh = data['refreshToken'] as String?;
      if (newToken != null && newToken.isNotEmpty) {
        await prefs.setString('authToken', newToken);
      }
      if (newRefresh != null && newRefresh.isNotEmpty) {
        await prefs.setString('refreshToken', newRefresh);
      }
      return newToken;
    }
  } catch (_) {
    // silencioso
  }
  return null;
}

Future<http.Response> _authedRequest(
  String method,
  Uri uri, {
  Map<String, String>? headers,
  Object? body,
  String? tokenOverride,
}) async {
  final prefs = await SharedPreferences.getInstance();
  String? token = prefs.getString('authToken') ?? tokenOverride;
  Map<String, String> resolved = {
    if (headers != null) ...headers,
  };
  if (token != null && token.isNotEmpty) {
    resolved['Authorization'] = 'Bearer $token';
  }

  Future<http.Response> send() {
    switch (method.toUpperCase()) {
      case 'POST':
        return http.post(uri, headers: resolved, body: body).timeout(kTimeout);
      case 'GET':
      default:
        return http.get(uri, headers: resolved).timeout(kTimeout);
    }
  }

  http.Response res = await send();
  if (res.statusCode == 401) {
    final newToken = await _refreshAuthTokenFromPrefs();
    if (newToken != null && newToken.isNotEmpty) {
      resolved['Authorization'] = 'Bearer $newToken';
      res = await send();
    }
  }
  return res;
}

Future<http.Response> _authedGet(String url, {String? token}) {
  return _authedRequest('GET', Uri.parse(url), tokenOverride: token);
}

Future<http.Response> _authedPost(
  String url, {
  String? token,
  Map<String, String>? headers,
  Object? body,
}) {
  return _authedRequest('POST', Uri.parse(url), tokenOverride: token, headers: headers, body: body);
}
const AndroidNotificationDetails kEventChannel = AndroidNotificationDetails(
  'notiflow_events',
  'Recordatorios de eventos',
  channelDescription: 'Notificaciones locales un día antes de los eventos',
  importance: Importance.high,
  priority: Priority.high,
  category: AndroidNotificationCategory.reminder,
  ticker: 'recordatorio evento',
);
const NotificationDetails kEventNotificationDetails = NotificationDetails(
  android: kEventChannel,
  iOS: DarwinNotificationDetails(
    categoryIdentifier: 'event_reminder',
    presentAlert: true,
    presentBadge: true,
    presentSound: true,
  ),
);

Future<void> _initLocalNotifications() async {
  const android = AndroidInitializationSettings('@mipmap/launcher_icon');
  const ios = DarwinInitializationSettings();
  await localNotifications.initialize(
    const InitializationSettings(android: android, iOS: ios),
  );
  tz.initializeTimeZones();
  // Sin detección de zona horaria nativa, usamos la local por defecto (cae a UTC si no está disponible).
  tz.setLocalLocation(tz.local);
  await localNotifications
      .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
      ?.requestNotificationsPermission();
  await localNotifications
      .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
      ?.requestPermissions(alert: true, badge: true, sound: true);
}

Future<void> _registerDeviceTokenWithAuth({
  required String authToken,
  required String email,
  String? fcmToken,
}) async {
  try {
    final token = fcmToken ?? await FirebaseMessaging.instance.getToken();
    if (token == null || token.isEmpty) return;
    if (_registeringTokens.contains(token)) return;
    _registeringTokens.add(token);
    await _attemptRegisterDeviceToken(
      authToken: authToken,
      email: email,
      fcmToken: token,
      attempt: 0,
    );
  } catch (_) {
    // silencioso; reintentamos en próximos arranques
  }
}

Future<void> _attemptRegisterDeviceToken({
  required String authToken,
  required String email,
  required String fcmToken,
  required int attempt,
}) async {
  try {
    final res = await _authedPost(
      '$apiBase/devices/register',
      token: authToken,
      headers: {
        'Content-Type': 'application/json',
      },
      body: jsonEncode({'token': fcmToken, 'platform': 'flutter', 'email': email}),
    );
    if (res.statusCode == 200 || res.statusCode == 204) {
      _registeringTokens.remove(fcmToken);
      return;
    }
    if (res.statusCode == 400 || res.statusCode == 401 || res.statusCode == 403) {
      _registeringTokens.remove(fcmToken);
      return;
    }
  } catch (_) {
    // seguimos con reintentos
  }

  if (attempt >= _registerRetryDelays.length) {
    _registeringTokens.remove(fcmToken);
    return;
  }
  final delay = _registerRetryDelays[attempt];
  Future.delayed(delay, () {
    _attemptRegisterDeviceToken(
      authToken: authToken,
      email: email,
      fcmToken: fcmToken,
      attempt: attempt + 1,
    );
  });
}

Future<void> _registerDeviceTokenFromPrefs({String? fcmToken}) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final authToken = prefs.getString('authToken');
    final email = prefs.getString('userEmail');
    if (authToken == null || authToken.isEmpty || email == null || email.isEmpty) return;
    await _registerDeviceTokenWithAuth(authToken: authToken, email: email, fcmToken: fcmToken);
  } catch (_) {
    // silencioso
  }
}

Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  await _initLocalNotifications();
  _showRemoteMessage(message);
}

void _showRemoteMessage(RemoteMessage message) {
  final notification = message.notification;
  final data = message.data;
  final title = notification?.title ??
      (data['title']?.toString()) ??
      (data['notificationTitle']?.toString()) ??
      'Notiflow';
  final body = notification?.body ??
      (data['body']?.toString()) ??
      (data['message']?.toString()) ??
      '';
  if (title.trim().isEmpty && body.trim().isEmpty) return;
  const details = NotificationDetails(
    android: AndroidNotificationDetails(
      'notiflow_remote',
      'Notificaciones',
      channelDescription: 'Alertas enviadas desde Notiflow',
      importance: Importance.max,
      priority: Priority.high,
      ticker: 'notiflow',
    ),
    iOS: DarwinNotificationDetails(presentAlert: true, presentBadge: true, presentSound: true),
  );
  localNotifications.show(message.hashCode, title, body, details, payload: message.data['route']);
}

class StudentOption {
  final String id;
  final String name;
  final String schoolId;
  final String? schoolName;
  final String? course;

  StudentOption({required this.id, required this.name, required this.schoolId, this.schoolName, this.course});

  factory StudentOption.fromJson(Map<String, dynamic> json) {
    return StudentOption(
      id: json['studentId'] as String? ?? '',
      name: json['fullName'] as String? ?? '',
      schoolId: json['schoolId'] as String? ?? '',
      schoolName: json['schoolName'] as String?,
      course: json['course'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'studentId': id,
      'fullName': name,
      'schoolId': schoolId,
      'schoolName': schoolName,
      'course': course,
    };
  }
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  runApp(const NotiflowApp());
}

class NotiflowApp extends StatelessWidget {
  const NotiflowApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Notiflow',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: kPrimary, brightness: Brightness.light),
        useMaterial3: true,
        scaffoldBackgroundColor: kAccent,
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.transparent,
          foregroundColor: kSecondary,
          elevation: 0,
          centerTitle: false,
        ),
        cardTheme: CardThemeData(
          color: kSurface,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          elevation: 6,
          shadowColor: kPrimary.withOpacity(0.08),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: kAccent,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: kPrimary, width: 1.4),
          ),
        ),
        textTheme: Theme.of(context).textTheme.apply(
              bodyColor: kSecondary,
              displayColor: kSecondary,
            ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: kSurface,
          indicatorColor: kPrimary.withOpacity(0.12),
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          labelTextStyle: MaterialStateProperty.all(
            const TextStyle(fontWeight: FontWeight.w700, color: kSecondary),
          ),
        ),
      ),
      home: const SplashScreen(),
    );
  }
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<String?> _refreshAccessTokenSplash(String refreshToken, SharedPreferences prefs) async {
    try {
      final res = await http.post(
        Uri.parse('$apiBase/auth/refresh'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refreshToken': refreshToken}),
      ).timeout(kTimeout);
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final newToken = data['token'] as String?;
        final newRefresh = data['refreshToken'] as String?;
        if (newToken != null && newToken.isNotEmpty) {
          await prefs.setString('authToken', newToken);
        }
        if (newRefresh != null && newRefresh.isNotEmpty) {
          await prefs.setString('refreshToken', newRefresh);
        }
        return newToken;
      }
    } catch (_) {
      // silencioso
    }
    return null;
  }

  Future<void> _bootstrap() async {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
    await _initLocalNotifications();
    await _initPush();
    _listenForegroundMessages();
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('authToken');
    final refresh = prefs.getString('refreshToken');
    String? freshToken = token;
    if ((token == null || token.isEmpty) && refresh != null && refresh.isNotEmpty) {
      freshToken = await _refreshAccessTokenSplash(refresh, prefs);
    }
    final email = prefs.getString('userEmail');
    final storedName = prefs.getString('userName');
    final storedSchool = prefs.getString('schoolName');
    final hasMultipleStudents = prefs.getBool('hasMultipleStudents') ?? false;
    if (!mounted) return;
    if (freshToken != null && freshToken.isNotEmpty && email != null && email.isNotEmpty) {
      await _registerDeviceTokenWithAuth(authToken: freshToken, email: email);
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => HomeShell(
            token: freshToken!,
            email: email,
            userName: storedName,
            studentName: storedName,
            schoolName: storedSchool,
            hasMultipleStudents: hasMultipleStudents,
          ),
        ),
      );
    } else {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const LoginPage()),
      );
    }
  }

  Future<void> _initPush() async {
    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission();
    await messaging.setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);
    messaging.onTokenRefresh.listen((token) async {
      await _registerDeviceTokenFromPrefs(fcmToken: token);
    });
  }

  void _listenForegroundMessages() {
    FirebaseMessaging.onMessage.listen(_showRemoteMessage);
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      // Si en el futuro quieres navegar con payload, usa message.data['route'].
    });
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator(color: kPrimary)),
    );
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _code = TextEditingController();
  bool _loading = false;
  String? _error;
  bool _codeSent = false;
  bool _needsStudentChoice = false;
  List<StudentOption> _options = [];
  String? _selectedStudentId;
  String? _infoMessage;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _requestCode() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
      _infoMessage = null;
      _needsStudentChoice = false;
      _options = [];
      _selectedStudentId = null;
    });
    try {
      final res = await http.post(
        Uri.parse('$apiBase/auth/otp/request'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': _email.text.trim(), 'studentsOnly': true}),
      ).timeout(kTimeout);
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        final reviewerCode = body['reviewerCode'] as String?;
        final serverMessage = body['message'] as String?;
        setState(() {
          _codeSent = true;
          if (reviewerCode != null && reviewerCode.isNotEmpty) {
            _code.text = reviewerCode;
            _infoMessage = 'Código de revisión: $reviewerCode';
          } else {
            _infoMessage = serverMessage ?? 'Te enviamos un código a tu correo. Revisa bandeja y spam.';
          }
        });
      } else {
        final msg = jsonDecode(res.body)['message'] ?? 'No se pudo enviar código';
        throw Exception(msg);
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verifyCode() async {
    if (_code.text.trim().length < 4) {
      setState(() => _error = 'Ingresa el código enviado a tu correo');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _infoMessage = null;
      _needsStudentChoice = false;
    });
    try {
      final res = await http.post(
        Uri.parse('$apiBase/auth/otp/verify'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'email': _email.text.trim(),
          'code': _code.text.trim(),
          'studentsOnly': true,
          if (_selectedStudentId != null) 'studentId': _selectedStudentId,
        }),
      ).timeout(kTimeout);
      if (res.statusCode == 409) {
        if (_selectedStudentId != null) {
          throw Exception('No se pudo validar el estudiante seleccionado. Intenta nuevamente.');
        }
        final body = jsonDecode(res.body);
        final opts = (body['options'] as List<dynamic>? ?? [])
            .map((e) => StudentOption.fromJson(e as Map<String, dynamic>))
            .where((o) => o.id.isNotEmpty)
            .toList();
        if (opts.isEmpty) {
          throw Exception(body['message'] ?? 'No se pudo validar el estudiante');
        }
        _options = opts;
        _selectedStudentId = opts.first.id;
        return await _verifyCode();
      }
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final token = data['token'] as String?;
        final email = _email.text.trim();
        final user = data['user'] as Map<String, dynamic>?;
        final studentsRaw = (data['students'] as List<dynamic>? ?? []);
        final students = studentsRaw
            .map((e) => e is Map<String, dynamic> ? StudentOption.fromJson(e) : null)
            .whereType<StudentOption>()
            .toList();

        final effectiveStudentId = _selectedStudentId ?? (students.isNotEmpty ? students.first.id : null);
        if (effectiveStudentId != null) {
          _selectedStudentId = effectiveStudentId;
        }

        final chosenStudent = effectiveStudentId != null
            ? students.firstWhere((s) => s.id == effectiveStudentId, orElse: () => students.isNotEmpty ? students.first : StudentOption(id: '', name: '', schoolId: ''))
            : (students.isNotEmpty ? students.first : StudentOption(id: '', name: '', schoolId: ''));
        final name = (chosenStudent.name.isNotEmpty ? chosenStudent.name : null) ??
            (user?['name'] as String?) ??
            (data['name'] as String?);
        final schoolName = chosenStudent.schoolName ?? user?['schoolName'] as String?;
        final hasMultipleStudents = students.length > 1;
        if (token == null) throw Exception('Token faltante');
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('authToken', token);
        final refresh = data['refreshToken'] as String?;
        if (refresh != null && refresh.isNotEmpty) {
          await prefs.setString('refreshToken', refresh);
        }
        await prefs.setString('userEmail', email);
        if (name != null) await prefs.setString('userName', name);
        if (schoolName != null) await prefs.setString('schoolName', schoolName);
        await prefs.setBool('hasMultipleStudents', hasMultipleStudents);
        if (students.isNotEmpty) {
          await prefs.setString('studentOptions', jsonEncode(students.map((s) => s.toJson()).toList()));
          final selectedId = _selectedStudentId ?? chosenStudent.id;
          if (selectedId.isNotEmpty) {
            await prefs.setString('selectedStudentId', selectedId);
          }
        }
        await _registerDeviceTokenWithAuth(authToken: token, email: email);
        if (!mounted) return;
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => HomeShell(
              token: token,
              email: email,
              userName: name,
              studentName: chosenStudent.name,
              schoolName: schoolName,
              hasMultipleStudents: hasMultipleStudents,
            ),
          ),
        );
      } else {
        final msg = jsonDecode(res.body)['message'] ??
            (res.statusCode == 401 ? 'Código incorrecto o expirado. Pide uno nuevo.' : 'No se pudo validar el código.');
        throw Exception(msg);
      }
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _registerDeviceToken(String token, String email) async {
    await _registerDeviceTokenWithAuth(authToken: token, email: email);
  }

  Future<String?> _refreshAccessToken(String refreshToken, SharedPreferences prefs) async {
    try {
      final res = await http.post(
        Uri.parse('$apiBase/auth/refresh'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refreshToken': refreshToken}),
      ).timeout(kTimeout);
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final newToken = data['token'] as String?;
        final newRefresh = data['refreshToken'] as String?;
        if (newToken != null && newToken.isNotEmpty) {
          await prefs.setString('authToken', newToken);
        }
        if (newRefresh != null && newRefresh.isNotEmpty) {
          await prefs.setString('refreshToken', newRefresh);
        }
        return newToken;
      }
    } catch (_) {
      // silencioso
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kSecondary,
      body: Stack(
        children: [
          Positioned(
            top: -120,
            left: -80,
            child: Container(
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(colors: [kPrimary.withOpacity(0.35), kGlow.withOpacity(0.3)]),
                boxShadow: [BoxShadow(color: kPrimary.withOpacity(0.18), blurRadius: 40, spreadRadius: 8)],
              ),
            ),
          ),
          Positioned(
            bottom: -140,
            right: -90,
            child: Container(
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(colors: [Colors.white.withOpacity(0.2), kGlow.withOpacity(0.28)]),
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(22),
                          border: Border.all(color: Colors.white.withOpacity(0.12)),
                          boxShadow: [
                            BoxShadow(color: Colors.black.withOpacity(0.12), blurRadius: 18, offset: const Offset(0, 8)),
                          ],
                        ),
                        child: Column(
                          children: [
                            Image.asset('assets/logos/NotiflowV_02.png', width: 150),
                            const SizedBox(height: 10),
                            const Text(
                              'Comunicaciones inteligentes, sin ruido',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.white70, fontSize: 14, fontWeight: FontWeight.w700),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 26),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: kSurface,
                          borderRadius: BorderRadius.circular(22),
                          boxShadow: [
                            BoxShadow(color: Colors.black.withOpacity(0.14), blurRadius: 26, offset: const Offset(0, 18)),
                          ],
                        ),
                        child: Form(
                          key: _formKey,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const Text(
                                'Ingresa con tu correo',
                                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: kSecondary),
                              ),
                              const SizedBox(height: 6),
                              const Text(
                                'Te enviaremos un código de verificación. Revisa también la carpeta de spam.',
                                style: TextStyle(color: Colors.black54, fontSize: 13, height: 1.3),
                              ),
                              const SizedBox(height: 18),
                              TextFormField(
                                controller: _email,
                                keyboardType: TextInputType.emailAddress,
                                decoration: const InputDecoration(
                                  labelText: 'Correo',
                                  prefixIcon: Icon(Icons.alternate_email_rounded),
                                ),
                                validator: (v) {
                                  if (v == null || v.trim().isEmpty) return 'Ingresa tu correo';
                                  final emailRegex = RegExp(r'^[^@]+@[^@]+\.[^@]+$');
                                  if (!emailRegex.hasMatch(v.trim())) return 'Correo inválido';
                                  return null;
                                },
                              ),
                              const SizedBox(height: 12),
                              if (_codeSent)
                                TextFormField(
                                  controller: _code,
                                  keyboardType: TextInputType.number,
                                  maxLength: 6,
                                  decoration: const InputDecoration(
                                    labelText: 'Código de 6 dígitos',
                                    prefixIcon: Icon(Icons.shield_moon_outlined),
                                    counterText: '',
                                  ),
                                ),
                              if (_needsStudentChoice && _options.isNotEmpty) ...[
                                const SizedBox(height: 12),
                                const Text(
                                  'Selecciona el estudiante asociado a tu correo:',
                                  style: TextStyle(fontWeight: FontWeight.w700, color: kSecondary),
                                ),
                                const SizedBox(height: 8),
                                ..._options.map(
                                  (o) => RadioListTile<String>(
                                    value: o.id,
                                    groupValue: _selectedStudentId,
                                    onChanged: _loading ? null : (v) => setState(() => _selectedStudentId = v),
                                    dense: true,
                                    title: Text(o.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                                    subtitle: Text('Colegio: ${o.schoolName ?? o.schoolId}',
                                        style: const TextStyle(color: Colors.black54)),
                                  ),
                                ),
                              ],
                              if (_error != null) ...[
                                const SizedBox(height: 12),
                                Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: Colors.red.shade50,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Row(
                                    children: [
                                      const Icon(Icons.error_outline, color: Colors.red),
                                      const SizedBox(width: 8),
                                      Expanded(child: Text(_error!, style: const TextStyle(color: Colors.red))),
                                    ],
                                  ),
                                ),
                              ],
                              if (_infoMessage != null) ...[
                                const SizedBox(height: 12),
                                Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: kAccent,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Row(
                                    children: [
                                      const Icon(Icons.info_outline, color: kSecondary),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          _infoMessage!,
                                          style: const TextStyle(color: kSecondary, fontWeight: FontWeight.w700),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                              const SizedBox(height: 18),
                              ElevatedButton(
                                onPressed: _loading ? null : (_codeSent ? _verifyCode : _requestCode),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: kPrimary,
                                  foregroundColor: Colors.white,
                                  minimumSize: const Size.fromHeight(52),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                                  shadowColor: kPrimary.withOpacity(0.32),
                                  elevation: 8,
                                ),
                                child: _loading
                                    ? const SizedBox(
                                        width: 20,
                                        height: 20,
                                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                      )
                                    : Text(_codeSent ? 'Validar código' : 'Enviar código'),
                              ),
                              if (_codeSent)
                                Padding(
                                  padding: const EdgeInsets.only(top: 10.0),
                                  child: TextButton(
                                    onPressed: _loading
                                        ? null
                                        : () {
                                            setState(() {
                                              _codeSent = false;
                                              _needsStudentChoice = false;
                                              _options = [];
                                              _selectedStudentId = null;
                                              _code.clear();
                                              _infoMessage = null;
                                              _error = null;
                                            });
                                          },
                                    child: const Text('¿No llegó? Reintentar con otro código'),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class HomeShell extends StatefulWidget {
  final String token;
  final String email;
  final String? userName;
  final String? studentName;
  final String? schoolName;
  final bool hasMultipleStudents;
  const HomeShell({
    super.key,
    required this.token,
    required this.email,
    this.userName,
    this.studentName,
    this.schoolName,
    this.hasMultipleStudents = false,
  });

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> with WidgetsBindingObserver {
  int _index = 0;
  bool _notificationsDisabled = false;
  List<StudentOption> _studentOptions = [];
  String _activeStudentId = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _checkNotificationPermission();
    _loadStudentOptions();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _checkNotificationPermission();
    }
  }

  Future<void> _checkNotificationPermission() async {
    try {
      final settings = await FirebaseMessaging.instance.getNotificationSettings();
      final disabled = settings.authorizationStatus == AuthorizationStatus.denied;
      if (!mounted) return;
      setState(() => _notificationsDisabled = disabled);
    } catch (_) {
      // silencioso
    }
  }

  Future<void> _openNotificationSettings() async {
    try {
      await AppSettings.openAppSettings();
    } catch (_) {
      try {
        await launchUrl(Uri.parse('app-settings:'), mode: LaunchMode.externalApplication);
      } catch (_) {
        // silencioso
      }
    }
  }

  void _logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('authToken');
    await prefs.remove('refreshToken');
    await prefs.remove('userEmail');
    await prefs.remove('userName');
    await prefs.remove('schoolName');
    await prefs.remove('hasMultipleStudents');
    await prefs.remove('studentOptions');
    await prefs.remove('selectedStudentId');
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginPage()),
      (_) => false,
    );
  }

  Future<void> _loadStudentOptions() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('studentOptions');
      final storedId = prefs.getString('selectedStudentId');
      List<StudentOption> options = [];
      if (raw != null && raw.isNotEmpty) {
        final decoded = jsonDecode(raw);
        if (decoded is List) {
          options = decoded
              .map((e) => e is Map<String, dynamic> ? StudentOption.fromJson(e) : null)
              .whereType<StudentOption>()
              .toList();
        }
      }
      String activeId = storedId ?? _activeStudentId;
      if (options.isNotEmpty) {
        final exists = options.any((s) => s.id == activeId);
        if (!exists) {
          activeId = options.first.id;
        }
      } else {
        activeId = '';
      }
      if (!mounted) return;
      setState(() {
        _studentOptions = options;
        _activeStudentId = activeId;
      });
    } catch (_) {
      // silencioso
    }
  }

  Future<void> _setActiveStudent(String id) async {
    setState(() => _activeStudentId = id);
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('selectedStudentId', id);
    } catch (_) {
      // silencioso
    }
  }

  String _firstName(String name) {
    final clean = name.trim();
    if (clean.isEmpty) return 'Alumno';
    final parts = clean.split(RegExp(r'\s+'));
    return parts.isNotEmpty ? parts.first : clean;
  }

  String _initialLetter(String name) {
    final first = _firstName(name);
    return first.isNotEmpty ? first.substring(0, 1).toUpperCase() : 'A';
  }

  @override
  Widget build(BuildContext context) {
    final activeStudentId = _activeStudentId.isNotEmpty ? _activeStudentId : null;
    final pages = [
      MuroPage(token: widget.token, studentId: activeStudentId),
      CalendarioPage(token: widget.token, studentId: activeStudentId),
      MessagesPage(token: widget.token, email: widget.email, studentId: activeStudentId),
    ];
    final titles = ['Muro', 'Eventos', 'Mensajes'];
    final icons = [Icons.campaign_outlined, Icons.event, Icons.message_outlined];

    final hasMultiple = _studentOptions.length > 1 || widget.hasMultipleStudents;
    final selectedStudent = _studentOptions.isEmpty
        ? null
        : _studentOptions.firstWhere(
            (s) => s.id == _activeStudentId,
            orElse: () => _studentOptions.first,
          );
    final selectedSchoolLabel = selectedStudent == null
        ? ''
        : ((selectedStudent.schoolName != null && selectedStudent.schoolName!.trim().isNotEmpty)
            ? selectedStudent.schoolName!.trim()
            : selectedStudent.schoolId);
    final selectedName = selectedStudent?.name ?? '';
    final selectedFullName = selectedName.trim().isNotEmpty ? selectedName.trim() : 'Alumno';
    final selectedFirstName = _firstName(selectedFullName);
    final selectedInitial = _initialLetter(selectedFullName);
    final selectedCourse = (selectedStudent?.course ?? '').trim();
    final accountName = widget.userName ?? widget.studentName ?? 'Cuenta';
    final schoolLabel = widget.schoolName ??
        (hasMultiple ? 'tus colegios' : 'tu colegio');

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              child: Container(
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Colors.white, Color(0xFFEFF3F9)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: [
                    BoxShadow(color: kSecondary.withOpacity(0.06), blurRadius: 18, offset: const Offset(0, 10)),
                  ],
                ),
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 56,
                          height: 56,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              colors: [kPrimary, kPrimary.withOpacity(0.6)],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            boxShadow: [
                              BoxShadow(color: kPrimary.withOpacity(0.18), blurRadius: 12, offset: const Offset(0, 6)),
                            ],
                          ),
                          padding: const EdgeInsets.all(6),
                          child: Container(
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.white,
                            ),
                            padding: const EdgeInsets.all(8),
                            child: Image.asset('assets/logos/Blanco.png', fit: BoxFit.contain),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Notiflow',
                                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: kSecondary),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                schoolLabel,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 13, color: Colors.black87, height: 1.2),
                              ),
                              const SizedBox(height: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: kSecondary.withOpacity(0.06),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Text(
                                  '¡Bienvenido, $accountName!',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 12, color: kSecondary, fontWeight: FontWeight.w700),
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: _logout,
                          icon: const Icon(Icons.logout_rounded, color: kSecondary),
                          tooltip: 'Cerrar sesión',
                        ),
                      ],
                    ),
                    if (_studentOptions.length > 1) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        decoration: BoxDecoration(
                          color: kSecondary.withOpacity(0.03),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: kSecondary.withOpacity(0.12)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                CircleAvatar(
                                  radius: 12,
                                  backgroundColor: kPrimary.withOpacity(0.14),
                                  child: Text(
                                    selectedInitial,
                                    style: const TextStyle(
                                      color: kPrimary,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 11,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                        'Alumno',
                                        style: TextStyle(fontSize: 9, color: kSecondary, fontWeight: FontWeight.w700),
                                      ),
                                      const SizedBox(height: 3),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                                        decoration: BoxDecoration(
                                          color: Colors.white,
                                          borderRadius: BorderRadius.circular(10),
                                          border: Border.all(color: kSecondary.withOpacity(0.12)),
                                        ),
                                        child: DropdownButtonHideUnderline(
                                          child: DropdownButton<String>(
                                            value: _activeStudentId,
                                            isDense: true,
                                            isExpanded: true,
                                            icon: const Icon(Icons.expand_more, size: 18),
                                            itemHeight: null,
                                            selectedItemBuilder: (context) {
                                              return _studentOptions.map((s) {
                                                final fullName = s.name.isNotEmpty ? s.name : 'Alumno';
                                                final firstName = _firstName(fullName);
                                                final initial = _initialLetter(fullName);
                                                return Row(
                                                  mainAxisSize: MainAxisSize.min,
                                                  children: [
                                                    CircleAvatar(
                                                      radius: 10,
                                                      backgroundColor: kPrimary.withOpacity(0.12),
                                                      child: Text(
                                                        initial,
                                                        style: const TextStyle(
                                                          color: kPrimary,
                                                          fontWeight: FontWeight.w800,
                                                          fontSize: 11,
                                                        ),
                                                      ),
                                                    ),
                                                    const SizedBox(width: 8),
                                                    Flexible(
                                                      child: Text(
                                                        firstName,
                                                        maxLines: 1,
                                                        overflow: TextOverflow.ellipsis,
                                                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800),
                                                      ),
                                                    ),
                                                  ],
                                                );
                                              }).toList();
                                            },
                                            items: _studentOptions
                                                .map(
                                                  (s) {
                                                    final fullName = s.name.isNotEmpty ? s.name : 'Alumno';
                                                    final course = (s.course ?? '').trim();
                                                    final initial = _initialLetter(fullName);
                                                    return DropdownMenuItem(
                                                      value: s.id,
                                                      child: Row(
                                                        children: [
                                                          CircleAvatar(
                                                            radius: 12,
                                                            backgroundColor: kPrimary.withOpacity(0.12),
                                                            child: Text(
                                                              initial,
                                                              style: const TextStyle(
                                                                color: kPrimary,
                                                                fontWeight: FontWeight.w800,
                                                                fontSize: 11,
                                                              ),
                                                            ),
                                                          ),
                                                          const SizedBox(width: 10),
                                                          Expanded(
                                                            child: Column(
                                                              crossAxisAlignment: CrossAxisAlignment.start,
                                                        children: [
                                                          Text(
                                                            fullName,
                                                            maxLines: 2,
                                                            overflow: TextOverflow.ellipsis,
                                                            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700),
                                                          ),
                                                          if (course.isNotEmpty)
                                                            Text(
                                                              course,
                                                              maxLines: 1,
                                                              overflow: TextOverflow.ellipsis,
                                                              style: const TextStyle(fontSize: 8, color: Colors.black54),
                                                            ),
                                                        ],
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                                    );
                                                  },
                                                )
                                                .toList(),
                                            onChanged: (value) {
                                              if (value == null) return;
                                              _setActiveStudent(value);
                                            },
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            if (selectedStudent != null) ...[
                              const SizedBox(height: 6),
                              Text(
                                'Nombre: $selectedFullName · Colegio: ${selectedSchoolLabel.isNotEmpty ? selectedSchoolLabel : '—'} · Curso: ${selectedCourse.isNotEmpty ? selectedCourse : '—'}',
                                style: const TextStyle(fontSize: 9, color: Colors.black54, fontWeight: FontWeight.w600),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                    if (_notificationsDisabled && _index == 0) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.orange.shade50,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: Colors.orange.shade200),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.notifications_off, color: Colors.orange, size: 16),
                            const SizedBox(width: 6),
                            const Expanded(
                              child: Text(
                                'Notificaciones desactivadas',
                                style: TextStyle(color: Colors.orange, fontSize: 11, fontWeight: FontWeight.w700),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            TextButton(
                              onPressed: _openNotificationSettings,
                              child: const Text('Activar'),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Container(
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [kSurface, kAccent]),
                  borderRadius: BorderRadius.circular(16),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(
                  children: [
                    Icon(icons[_index], color: kPrimary),
                    const SizedBox(width: 8),
                    Text(
                      titles[_index],
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: kSecondary),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Expanded(child: pages[_index]),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          NavigationDestination(icon: Icon(icons[0]), label: titles[0]),
          NavigationDestination(icon: Icon(icons[1]), label: titles[1]),
          NavigationDestination(icon: Icon(icons[2]), label: titles[2]),
        ],
      ),
    );
  }
}

class MuroPage extends StatefulWidget {
  final String token;
  final String? studentId;
  const MuroPage({super.key, required this.token, this.studentId});

  @override
  State<MuroPage> createState() => _MuroPageState();
}

class _MuroPageState extends State<MuroPage> {
  List<Map<String, dynamic>> _messages = [];
  int _loaded = 0;
  final int _pageSize = 10;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadWall();
  }

  @override
  void didUpdateWidget(covariant MuroPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.studentId != widget.studentId) {
      _loadWall();
    }
  }

  bool _isBroadcast(Map msg) {
    if (msg['broadcast'] == true) return true;
    final List rec = (msg['recipients'] as List?) ?? [];
    final hasRecipients = rec.isNotEmpty;
    final joined = rec.map((e) => e.toString().toLowerCase()).toList();
    final hasAll = joined.contains('all') || joined.contains('global');
    return !hasRecipients || hasAll || rec.length > 50; // heurística para "toda la comunidad"
  }

  Future<void> _loadWall() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      List<dynamic> data = [];
      List<dynamic> _extractList(dynamic body) {
        if (body is List) return body;
        if (body is Map) {
          final content = body['content'] ?? body['items'] ?? body['data'];
          if (content is List) return content;
        }
        return [];
      }
      // Intento principal: mensajes sin filtro (puede fallar por permisos)
      final res = await _authedGet(_messagesUrl(), token: widget.token);
      if (res.statusCode == 200) {
        data = _extractList(jsonDecode(res.body));
      } else {
        // Fallback: usar mensajes personales y filtrar los masivos
        final resSelf = await _authedGet(_messagesUrl(self: true), token: widget.token);
        if (resSelf.statusCode == 200) {
          data = _extractList(jsonDecode(resSelf.body));
        } else {
          final msg = (() {
            try {
              return (jsonDecode(res.body) as Map?)?['message'] ?? (jsonDecode(resSelf.body) as Map?)?['message'];
            } catch (_) {
              return null;
            }
          })();
          throw Exception(msg ?? 'Error al cargar muro (${res.statusCode})');
        }
      }
      final wall = data
          .whereType<Map>()
          .where(_isBroadcast)
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      wall.sort((a, b) {
        final da = DateTime.tryParse(a['createdAt'] ?? '') ?? DateTime.now();
        final db = DateTime.tryParse(b['createdAt'] ?? '') ?? DateTime.now();
        return db.compareTo(da);
      });
      if (!mounted) return;
      setState(() {
        _messages = wall;
        _loaded = wall.length > _pageSize ? _pageSize : wall.length;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  String _messagesUrl({bool self = false}) {
    final params = <String, String>{};
    if (self) params['self'] = 'true';
    final studentId = widget.studentId;
    if (studentId != null && studentId.isNotEmpty) {
      params['studentId'] = studentId;
    }
    if (params.isEmpty) return '$apiBase/messages';
    return Uri.parse('$apiBase/messages').replace(queryParameters: params).toString();
  }

  String _formatDate(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    final dt = DateTime.tryParse(iso);
    if (dt == null) return '';
    final d = dt.toLocal();
    return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final visible = _messages.take(_loaded).toList();
    final hasMore = _loaded < _messages.length;

    void loadMore() {
      if (_loadingMore || !hasMore) return;
      setState(() => _loadingMore = true);
      Future.delayed(const Duration(milliseconds: 100), () {
        if (!mounted) return;
        setState(() {
          _loaded = (_loaded + _pageSize).clamp(0, _messages.length);
          _loadingMore = false;
        });
      });
    }

    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: kPrimary));
    }
    if (_error != null) {
      return RefreshIndicator(
        onRefresh: _loadWall,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(12)),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadWall,
      child: NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (n.metrics.pixels >= n.metrics.maxScrollExtent - 100) {
            loadMore();
          }
          return false;
        },
        child: ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: visible.length + (hasMore ? 1 : 0),
          itemBuilder: (context, index) {
            if (hasMore && index == visible.length) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(child: CircularProgressIndicator(color: kPrimary, strokeWidth: 2)),
              );
            }
            final m = visible[index];
            final hasAttachments = (m['attachments'] as List?)?.isNotEmpty == true;
            final preview = (m['content'] ?? '').toString();
            final reason = (m['reason'] ?? '').toString();
            final title = reason.isNotEmpty ? reason : (m['senderName'] ?? 'Comunidad');
            final dateLabel = _formatDate(m['createdAt'] as String?);
            return Container(
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                gradient: const LinearGradient(
                  colors: [Colors.white, Color(0xFFE0F7FF)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                boxShadow: [
                  BoxShadow(color: kPrimary.withOpacity(0.08), blurRadius: 18, offset: const Offset(0, 8)),
                ],
              ),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: kPrimary.withOpacity(0.15),
                                  shape: BoxShape.circle,
                                  boxShadow: [
                                    BoxShadow(color: kPrimary.withOpacity(0.2), blurRadius: 10, offset: const Offset(0, 4)),
                                  ],
                                ),
                                child: const Icon(Icons.campaign, color: kSecondary),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      title,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: kSecondary),
                                    ),
                                    if (dateLabel.isNotEmpty)
                                      Text(dateLabel, style: const TextStyle(color: Colors.black54, fontSize: 12)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Chip(
                            labelPadding: const EdgeInsets.symmetric(horizontal: 8),
                            label: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.group, size: 14, color: kSecondary),
                                const SizedBox(width: 4),
                                Flexible(
                                  child: Text(
                                    'Comunidad',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(color: kSecondary.withOpacity(0.9), fontWeight: FontWeight.w700),
                                  ),
                                ),
                              ],
                            ),
                            backgroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    if (preview.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: MarkdownBody(
                          data: preview,
                          shrinkWrap: true,
                          selectable: false,
                          styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
                            p: const TextStyle(fontSize: 14, color: Colors.black87, height: 1.4),
                            strong: const TextStyle(fontWeight: FontWeight.w800, color: kSecondary),
                            em: const TextStyle(fontStyle: FontStyle.italic, color: kSecondary),
                            del: const TextStyle(decoration: TextDecoration.lineThrough, color: Colors.black54),
                          ),
                          onTapLink: (text, href, title) {
                            if (href == null) return;
                            launchUrl(Uri.parse(href), mode: LaunchMode.externalApplication);
                          },
                        ),
                      ),
                    // previsualiza primera imagen inline si existe
                    Builder(builder: (_) {
                      final attachments = (m['attachments'] as List?) ?? [];
                      final inlineImgs = attachments.whereType<Map>().where((a) {
                            final mime = (a['mimeType'] ?? '').toString().toLowerCase();
                            final isImage = mime.startsWith('image/') ||
                                (a['fileName'] ?? '')
                                    .toString()
                                    .toLowerCase()
                                    .contains(RegExp(r'\.(png|jpe?g|gif|webp|bmp|svg)$'));
                        return isImage && a['inline'] == true && (a['downloadUrl'] ?? '').toString().isNotEmpty;
                      }).toList();
                      if (inlineImgs.isEmpty) return const SizedBox.shrink();
                      final url = inlineImgs.first['downloadUrl'] as String?;
                      if (url == null || url.isEmpty) return const SizedBox.shrink();
                      return Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: Image.network(
                            url,
                            height: 160,
                            width: double.infinity,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => Container(
                              height: 160,
                              color: Colors.grey.shade200,
                              alignment: Alignment.center,
                              child: const Text('Imagen no disponible', style: TextStyle(color: Colors.black54)),
                            ),
                          ),
                        ),
                      );
                    }),
                    if (hasAttachments) ...[
                      const SizedBox(height: 10),
                      Row(
                        children: const [
                          Icon(Icons.attach_file, size: 16, color: kSecondary),
                          SizedBox(width: 4),
                          Text('Incluye adjuntos', style: TextStyle(fontSize: 12, color: Colors.black54)),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class CalendarioPage extends StatefulWidget {
  final String token;
  final String? studentId;
  const CalendarioPage({super.key, required this.token, this.studentId});

  @override
  State<CalendarioPage> createState() => _CalendarioPageState();
}

class _CalendarioPageState extends State<CalendarioPage> {
  List<Map<String, dynamic>> _events = [];
  bool _loading = true;
  String? _error;
  DateTime _month = DateTime.now();
  DateTime _selectedDay = DateTime.now();
  Map<String, int> _dayCounts = {};

  @override
  void initState() {
    super.initState();
    _fetchEvents();
  }

  @override
  void didUpdateWidget(covariant CalendarioPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.studentId != widget.studentId) {
      _fetchEvents();
    }
  }

  Future<void> _fetchEvents() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await _authedGet(_eventsUrl(), token: widget.token);
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data is List) {
          setState(() {
            _events = data.cast<Map<String, dynamic>>();
            _dayCounts = _buildDayCounts(_events);
          });
          await _scheduleReminders();
        }
      } else {
        throw Exception('No se pudieron cargar los eventos');
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _eventsUrl() {
    final params = <String, String>{};
    final studentId = widget.studentId;
    if (studentId != null && studentId.isNotEmpty) {
      params['studentId'] = studentId;
    }
    if (params.isEmpty) return '$apiBase/events';
    return Uri.parse('$apiBase/events').replace(queryParameters: params).toString();
  }

  Map<String, int> _buildDayCounts(List<Map<String, dynamic>> events) {
    final map = <String, int>{};
    for (final e in events) {
      final startDt = _parseStart(e);
      if (startDt == null) continue;
      final key =
          '${startDt.year.toString().padLeft(4, '0')}-${startDt.month.toString().padLeft(2, '0')}-${startDt.day.toString().padLeft(2, '0')}';
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }

  DateTime? _parseStart(Map<String, dynamic> e) {
    final raw = (e['startDateTime'] ?? e['createdAt'] ?? '') as String;
    if (raw.isEmpty) return null;
    return DateTime.tryParse(raw)?.toLocal();
  }

  List<DateTime?> _buildCalendarDays(DateTime month) {
    final first = DateTime(month.year, month.month, 1);
    final startWeekday = first.weekday; // 1-7 (Mon-Sun)
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final cells = <DateTime?>[];
    for (int i = 1; i < startWeekday; i++) {
      cells.add(null);
    }
    for (int d = 1; d <= daysInMonth; d++) {
      cells.add(DateTime(month.year, month.month, d));
    }
    while (cells.length % 7 != 0) {
      cells.add(null);
    }
    return cells;
  }

  List<Map<String, dynamic>> _eventsForDay(DateTime day) {
    final key = '${day.year.toString().padLeft(4, '0')}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
    return _events.where((e) {
      final dt = _parseStart(e);
      if (dt == null) return false;
      final matchKey =
          '${dt.year.toString().padLeft(4, '0')}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
      return matchKey == key;
    }).toList();
  }

  Future<void> _scheduleReminders() async {
    if (!mounted) return;
    final now = DateTime.now();
    // Limpiamos para evitar duplicados
    await localNotifications.cancelAll();
    for (final e in _events) {
      final dt = _parseStart(e);
      if (dt == null) continue;
      final reminder = DateTime(dt.year, dt.month, dt.day - 1, 18, 0);
      if (!reminder.isAfter(now)) continue;
      final id = (e['id'] ?? e['title'] ?? reminder.millisecondsSinceEpoch).hashCode & 0x7fffffff;
      final title = e['title'] ?? 'Evento';
      final desc = (e['description'] ?? '').toString();
      final body = desc.isNotEmpty ? 'Mañana: $desc' : 'Mañana: $title';
      final tzDate = tz.TZDateTime.from(reminder, tz.local);
      await localNotifications.zonedSchedule(
        id,
        title,
        body,
        tzDate,
        kEventNotificationDetails,
        androidAllowWhileIdle: true,
        uiLocalNotificationDateInterpretation: UILocalNotificationDateInterpretation.wallClockTime,
        matchDateTimeComponents: DateTimeComponents.dateAndTime,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final days = _buildCalendarDays(_month);
    final monthLabel = '${_month.year} - ${_month.month.toString().padLeft(2, '0')}';
    final selectedEvents = _eventsForDay(_selectedDay);
    final today = DateTime.now();
    final todayStart = DateTime(today.year, today.month, today.day);
    final limit = todayStart.add(const Duration(days: 7));
    DateTime? _parseStart(Map<String, dynamic> e) {
      final s = (e['startDateTime'] ?? e['createdAt'] ?? '') as String;
      final dt = DateTime.tryParse(s);
      return dt?.toLocal();
    }
    final upcoming = _events
        .where((e) {
          final dt = _parseStart(e);
          if (dt == null) return false;
          final day = DateTime(dt.year, dt.month, dt.day);
          return !day.isBefore(todayStart) && !day.isAfter(limit);
        })
        .toList()
      ..sort((a, b) {
        final da = _parseStart(a) ?? DateTime.now();
        final db = _parseStart(b) ?? DateTime.now();
        return da.compareTo(db);
      });

    return RefreshIndicator(
      onRefresh: _fetchEvents,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Colors.white, kAccent]),
              borderRadius: BorderRadius.circular(18),
              boxShadow: [
                BoxShadow(color: kPrimary.withOpacity(0.12), blurRadius: 18, offset: const Offset(0, 10)),
              ],
            ),
            padding: const EdgeInsets.all(12),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    IconButton(
                      onPressed: () => setState(() => _month = DateTime(_month.year, _month.month - 1, 1)),
                      icon: const Icon(Icons.chevron_left),
                    ),
                    Column(
                      children: [
                        const Text('Eventos', style: TextStyle(fontWeight: FontWeight.w700, color: kSecondary)),
                        Text(monthLabel, style: const TextStyle(color: Colors.black54)),
                      ],
                    ),
                    IconButton(
                      onPressed: () => setState(() => _month = DateTime(_month.year, _month.month + 1, 1)),
                      icon: const Icon(Icons.chevron_right),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 7,
                    mainAxisSpacing: 6,
                    crossAxisSpacing: 6,
                  ),
                  itemCount: days.length,
                  itemBuilder: (context, index) {
                    final d = days[index];
                    if (d == null) return const SizedBox.shrink();
                    final evs = _eventsForDay(d);
                    final isSelected = d.year == _selectedDay.year && d.month == _selectedDay.month && d.day == _selectedDay.day;
                    final hasEvents = evs.isNotEmpty || _dayCounts.containsKey(d.toIso8601String().substring(0, 10));
                    return GestureDetector(
                      onTap: () => setState(() => _selectedDay = d),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? kPrimary.withOpacity(0.18)
                              : hasEvents
                                  ? kPrimary.withOpacity(0.08)
                                  : Colors.white,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: isSelected ? kPrimary : Colors.grey.shade200),
                          boxShadow: isSelected
                              ? [
                                  BoxShadow(color: kPrimary.withOpacity(0.2), blurRadius: 12, offset: const Offset(0, 6)),
                                ]
                              : [],
                        ),
                        padding: const EdgeInsets.all(6),
                        height: 72,
                        child: Center(
                          child: Text(
                            '${d.day}',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              color: isSelected
                                  ? kSecondary
                                  : hasEvents
                                      ? kSecondary.withOpacity(0.8)
                                      : Colors.black87,
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (_error != null)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(12)),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
          if (_loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(color: kPrimary),
              ),
            ),
          if (!_loading && upcoming.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text('Próximos 7 días', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: kSecondary)),
            const SizedBox(height: 8),
            ...upcoming.map((e) {
              final dt = _parseStart(e);
              final dayLabel = dt != null
                  ? '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')} '
                      '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}'
                  : 'Fecha sin definir';
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.grey.shade200),
                  boxShadow: [
                    BoxShadow(color: kSecondary.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, 6)),
                  ],
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: kPrimary.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.notifications_active_outlined, color: kPrimary),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            e['title'] ?? 'Evento',
                            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: kSecondary),
                          ),
                          Text(dayLabel, style: const TextStyle(color: Colors.black54, fontSize: 12)),
                          if ((e['description'] ?? '').toString().isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                e['description'],
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: Colors.black87, fontSize: 12),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
          if (!_loading)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Eventos del ${_selectedDay.day}/${_selectedDay.month}',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: kSecondary),
                ),
                const SizedBox(height: 8),
                if (selectedEvents.isEmpty)
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.grey.shade200),
                    ),
                    child: const Text('No tienes eventos para este día.'),
                  ),
                ...selectedEvents.map((e) {
                  final start = e['startDateTime'] ?? e['createdAt'] ?? '';
                  final when = start.toString().isNotEmpty
                      ? DateTime.tryParse(start)?.toLocal().toString().replaceFirst(':00.000', '') ?? ''
                      : '';
                  return Card(
                    margin: const EdgeInsets.only(bottom: 12, top: 8),
                    elevation: 10,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: kPrimary.withOpacity(0.12),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: const Icon(Icons.event, color: kPrimary),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      e['title'] ?? 'Evento',
                                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: kSecondary),
                                    ),
                                    if (when.isNotEmpty)
                                      Text(
                                        when,
                                        style: const TextStyle(color: Colors.black54, fontSize: 12),
                                      ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          if ((e['description'] ?? '').toString().isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Text(e['description'] ?? '', style: const TextStyle(color: Colors.black87)),
                          ],
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Chip(
                                label: Text((e['type'] ?? 'general') == 'schedule' ? 'Horario' : 'Evento'),
                                backgroundColor: (e['type'] ?? 'general') == 'schedule'
                                    ? Colors.purple.shade50
                                    : Colors.blue.shade50,
                                labelStyle: TextStyle(
                                  color: (e['type'] ?? 'general') == 'schedule' ? Colors.purple : Colors.blue,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(width: 8),
                              if ((e['createdByName'] ?? '').toString().isNotEmpty)
                                Chip(
                                  label: Text('Por ${e['createdByName']}'),
                                  backgroundColor: Colors.grey.shade100,
                                  labelStyle: const TextStyle(color: kSecondary),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                }),
              ],
            ),
        ],
      ),
    );
  }
}

class MessagesPage extends StatefulWidget {
  final String token;
  final String email;
  final String? studentId;
  const MessagesPage({super.key, required this.token, required this.email, this.studentId});

  @override
  State<MessagesPage> createState() => _MessagesPageState();
}

class _MessagesPageState extends State<MessagesPage> {
  List<dynamic> _messages = [];
  int _loaded = 0;
  final int _pageSize = 10;
  bool _loadingMore = false;
  bool _loading = true;
  String? _error;
  int _unreadCount = 0;

  Future<Set<String>> _loadLocalReadIds() async {
    final prefs = await SharedPreferences.getInstance();
    final key = 'readMessages_${widget.email}';
    return (prefs.getStringList(key) ?? []).toSet();
  }

  Future<void> _persistReadId(String id) async {
    final prefs = await SharedPreferences.getInstance();
    final key = 'readMessages_${widget.email}';
    final list = prefs.getStringList(key) ?? [];
    if (!list.contains(id)) {
      list.add(id);
      await prefs.setStringList(key, list);
    }
  }

  String _formatDateFriendly(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    final dt = DateTime.tryParse(iso);
    if (dt == null) return '';
    final d = dt.toLocal();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final thatDay = DateTime(d.year, d.month, d.day);
    final diffDays = thatDay.difference(today).inDays;
    String dayLabel;
    if (diffDays == 0) {
      dayLabel = 'Hoy';
    } else if (diffDays == -1) {
      dayLabel = 'Ayer';
    } else {
      final months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      dayLabel = '${thatDay.day.toString().padLeft(2, '0')} ${months[thatDay.month - 1]} ${thatDay.year}';
    }
    final time = '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    return '$dayLabel · $time';
  }

  @override
  void initState() {
    super.initState();
    _loadMessages();
  }

  @override
  void didUpdateWidget(covariant MessagesPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.studentId != widget.studentId) {
      _loadMessages();
    }
  }

  Future<void> _loadMessages() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      List<dynamic> _extractList(dynamic body) {
        if (body is List) return body;
        if (body is Map) {
          final content = body['content'] ?? body['items'] ?? body['data'];
          if (content is List) return content;
        }
        return [];
      }
      final res = await _authedGet(_messagesUrl(), token: widget.token);
      if (res.statusCode == 200) {
        final data = _extractList(jsonDecode(res.body));
        final localRead = await _loadLocalReadIds();
        if (!mounted) return;
        setState(() {
          _messages = data.map((m) {
            if (m is! Map) return m;
            final id = m['id'];
            if (id == null) return m;
            final readBy = (m['appReadBy'] as List?)?.toList() ?? [];
            if (localRead.contains(id) && !readBy.contains(widget.email)) {
              readBy.add(widget.email);
            }
            return {...m, 'appReadBy': readBy};
          }).toList();
          _loaded = _messages.length > _pageSize ? _pageSize : _messages.length;
          _unreadCount = _messages.whereType<Map>().where((m) {
            final List<dynamic> readBy = (m['appReadBy'] as List?) ?? [];
            return !readBy.contains(widget.email);
          }).length;
        });
      } else {
        String? msg;
        try {
          msg = (jsonDecode(res.body) as Map?)?['message'] as String?;
        } catch (_) {}
        throw Exception(msg ?? 'Error al cargar mensajes (${res.statusCode})');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  String _messagesUrl() {
    final params = <String, String>{'self': 'true'};
    final studentId = widget.studentId;
    if (studentId != null && studentId.isNotEmpty) {
      params['studentId'] = studentId;
    }
    return Uri.parse('$apiBase/messages').replace(queryParameters: params).toString();
  }

  @override
  Widget build(BuildContext context) {
    void loadMore() {
      if (_loadingMore) return;
      if (_loaded >= _messages.length) return;
      setState(() {
        _loadingMore = true;
      });
      Future.delayed(const Duration(milliseconds: 100), () {
        if (!mounted) return;
        setState(() {
          _loaded = (_loaded + _pageSize).clamp(0, _messages.length);
          _loadingMore = false;
        });
      });
    }

    final visible = _messages.take(_loaded).toList();
    final bool hasMore = _loaded < _messages.length;

    return _loading
        ? const Center(child: CircularProgressIndicator(color: kPrimary))
        : _error != null
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(_error!, style: const TextStyle(color: Colors.red)),
                  ),
                ),
              )
            : RefreshIndicator(
                onRefresh: _loadMessages,
                child: NotificationListener<ScrollNotification>(
                  onNotification: (notification) {
                    if (notification.metrics.pixels >= notification.metrics.maxScrollExtent - 120) {
                      loadMore();
                    }
                    return false;
                  },
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: visible.length + (hasMore ? 1 : 0) + 1,
                    itemBuilder: (context, index) {
                      if (index == 0) {
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Mensajes', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: kSecondary)),
                            if (_unreadCount > 0) ...[
                              const SizedBox(height: 8),
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                decoration: BoxDecoration(
                                  color: Colors.orange.shade50,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: Colors.orange.shade200),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(Icons.notifications_active, color: Colors.orange, size: 18),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        'Tienes $_unreadCount mensaje${_unreadCount == 1 ? '' : 's'} sin leer',
                                        style: const TextStyle(
                                          color: Colors.orange,
                                          fontWeight: FontWeight.w700,
                                          fontSize: 13,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 12),
                            ],
                          ],
                        );
                      }
                      final adjIndex = index - 1;
                      if (hasMore && adjIndex == visible.length) {
                        return const Padding(
                          padding: EdgeInsets.symmetric(vertical: 16),
                          child: Center(child: CircularProgressIndicator(color: kPrimary, strokeWidth: 2)),
                        );
                      }
                      final m = visible[adjIndex];
                      final List<dynamic> readBy = (m['appReadBy'] as List?) ?? [];
                      final bool isRead = readBy.contains(widget.email);
                      final hasAttachments = (m['attachments'] as List?)?.isNotEmpty == true;
                      final contentPreview = (m['content'] ?? '').toString();
                      final dateLabel = _formatDateFriendly(m['createdAt'] as String?);
                      return AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          gradient: isRead
                              ? const LinearGradient(colors: [kSurface, kAccent])
                              : LinearGradient(
                                  colors: [kPrimary.withOpacity(0.12), Colors.white],
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                ),
                          borderRadius: BorderRadius.circular(18),
                          boxShadow: [
                            BoxShadow(
                              color: kSecondary.withOpacity(0.05),
                              blurRadius: 12,
                              offset: const Offset(0, 6),
                            ),
                          ],
                          border: Border.all(
                            color: isRead ? Colors.transparent : kPrimary.withOpacity(0.35),
                            width: 1,
                          ),
                        ),
                        child: ListTile(
                          contentPadding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                          leading: Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: isRead ? kPrimary.withOpacity(0.12) : kGlow.withOpacity(0.22),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(
                              isRead ? Icons.mark_email_read_outlined : Icons.mark_email_unread_outlined,
                              color: isRead ? kPrimary : kSecondary,
                            ),
                          ),
                          title: Text(
                            m['reason'] ?? m['content'] ?? '',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w800, color: kSecondary),
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  if (!isRead)
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: kSecondary.withOpacity(0.08),
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: const Text('Nuevo', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                                    ),
                                  if (!isRead) const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      'De: ${m['senderName'] ?? ''}',
                                      style: const TextStyle(color: Colors.black54),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ),
                              if (contentPreview.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 4),
                                  child: MarkdownBody(
                                    data: contentPreview,
                                    shrinkWrap: true,
                                    selectable: false,
                                    styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
                                      p: const TextStyle(color: Colors.black87, fontSize: 12, height: 1.3),
                                      strong: const TextStyle(fontWeight: FontWeight.w800, color: kSecondary),
                                      em: const TextStyle(fontStyle: FontStyle.italic, color: kSecondary),
                                      del: const TextStyle(decoration: TextDecoration.lineThrough, color: Colors.black54),
                                    ),
                                    onTapLink: (text, href, title) {
                                      if (href == null) return;
                                      launchUrl(Uri.parse(href), mode: LaunchMode.externalApplication);
                                    },
                                  ),
                                ),
                              if (dateLabel.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 4),
                                  child: Text(
                                    dateLabel,
                                    style: const TextStyle(color: Colors.black54, fontSize: 11),
                                  ),
                                ),
                              // preview primera imagen inline si existe
                              Builder(builder: (_) {
                                final attachments = (m['attachments'] as List?) ?? [];
                                final inlineImgs = attachments.whereType<Map>().where((a) {
                                  final mime = (a['mimeType'] ?? '').toString().toLowerCase();
                                  final isImage = mime.startsWith('image/') ||
                                      (a['fileName'] ?? '')
                                          .toString()
                                          .toLowerCase()
                                          .contains(RegExp(r'\.(png|jpe?g|gif|webp|bmp|svg)$'));
                                  return isImage && a['inline'] == true && (a['downloadUrl'] ?? '').toString().isNotEmpty;
                                }).toList();
                                if (inlineImgs.isEmpty) return const SizedBox.shrink();
                                final url = inlineImgs.first['downloadUrl'] as String?;
                                if (url == null || url.isEmpty) return const SizedBox.shrink();
                                return Padding(
                                  padding: const EdgeInsets.only(top: 8),
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(10),
                                    child: Image.network(
                                      url,
                                      height: 140,
                                      width: double.infinity,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) => Container(
                                        height: 140,
                                        color: Colors.grey.shade200,
                                        alignment: Alignment.center,
                                        child: const Text('Imagen no disponible', style: TextStyle(color: Colors.black54)),
                                      ),
                                    ),
                                  ),
                                );
                              }),
                            ],
                          ),
                          trailing: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (hasAttachments)
                                const Icon(Icons.attach_file, color: kSecondary, size: 18),
                              const SizedBox(height: 6),
                              Icon(
                                isRead ? Icons.check_circle : Icons.circle_notifications,
                                color: isRead ? Colors.green : Colors.orange,
                              ),
                            ],
                          ),
                          onTap: () async {
                            Map fullMessage = Map.from(m as Map);
                            try {
                              final res = await _authedGet('$apiBase/messages/${m['id']}', token: widget.token);
                              if (res.statusCode == 200) {
                                fullMessage = jsonDecode(res.body) as Map<String, dynamic>;
                              }
                            } catch (_) {
                              // si falla, seguimos con el m parcial
                            }
                            await _markRead(m);
                            if (!mounted) return;
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => MessageDetailPage(
                                  message: fullMessage,
                                  email: widget.email,
                                  token: widget.token,
                                  onMarkedRead: () => _markRead(m),
                                ),
                              ),
                            );
                          },
                        ),
                      );
                    },
                  ),
                ),
              );
  }

  Future<void> _markRead(dynamic message) async {
    final id = message['id'] as String?;
    if (id == null) return;
    try {
      await _authedPost(
        '$apiBase/messages/$id/read',
        token: widget.token,
        headers: {
          'Content-Type': 'application/json',
        },
      );
      await _persistReadId(id);
      if (!mounted) return;
      setState(() {
        final List<dynamic> updated = List.of(_messages);
        final idx = updated.indexOf(message);
        if (idx != -1) {
          final msg = Map<String, dynamic>.from(updated[idx] as Map);
          final readBy = (msg['appReadBy'] as List?)?.toList() ?? [];
          final wasUnread = !readBy.contains(widget.email);
          if (wasUnread) {
            readBy.add(widget.email);
            if (_unreadCount > 0) _unreadCount = _unreadCount - 1;
          }
          msg['appReadBy'] = readBy;
          updated[idx] = msg;
          _messages = updated;
        }
      });
    } catch (_) {
      // opcional: mostrar snackbar
    }
  }
}

class MessageDetailPage extends StatelessWidget {
  final Map message;
  final String email;
  final String token;
  final Future<void> Function()? onMarkedRead;
  const MessageDetailPage({super.key, required this.message, required this.email, required this.token, this.onMarkedRead});

  @override
  Widget build(BuildContext context) {
    return _MessageDetailBody(message: message, email: email, token: token, onMarkedRead: onMarkedRead);
  }
}

class _MessageDetailBody extends StatefulWidget {
  final Map message;
  final String email;
  final String token;
  final Future<void> Function()? onMarkedRead;
  const _MessageDetailBody({required this.message, required this.email, required this.token, this.onMarkedRead});

  @override
  State<_MessageDetailBody> createState() => _MessageDetailBodyState();
}

class _MessageDetailBodyState extends State<_MessageDetailBody> {
  Map _data = {};
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _data = widget.message;
    _fetchDetail();
  }

  Future<void> _fetchDetail() async {
    final id = _data['id'] ?? widget.message['id'];
    if (id == null) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Mensaje sin ID';
      });
      return;
    }
    try {
      final res = await _authedGet('$apiBase/messages/$id', token: widget.token);
      if (res.statusCode == 200) {
        final map = jsonDecode(res.body) as Map<String, dynamic>;
        if (!mounted) return;
        setState(() {
          _data = map;
        });
        if (widget.onMarkedRead != null) {
          await widget.onMarkedRead!();
        }
      } else {
        if (!mounted) return;
        setState(() => _error = 'No se pudo cargar el detalle (${res.statusCode})');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  String _formatDateFriendly(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    final dt = DateTime.tryParse(iso);
    if (dt == null) return '';
    final d = dt.toLocal();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final thatDay = DateTime(d.year, d.month, d.day);
    final diffDays = thatDay.difference(today).inDays;
    String dayLabel;
    if (diffDays == 0) {
      dayLabel = 'Hoy';
    } else if (diffDays == -1) {
      dayLabel = 'Ayer';
    } else {
      final months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      dayLabel = '${thatDay.day.toString().padLeft(2, '0')} ${months[thatDay.month - 1]} ${thatDay.year}';
    }
    final time = '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    return '$dayLabel · $time';
  }

  @override
  Widget build(BuildContext context) {
    final attachments = (_data['attachments'] as List?) ?? [];
    final List<Map<String, dynamic>> inlineImages = attachments.whereType<Map>().where((a) {
      final mime = (a['mimeType'] ?? '').toString().toLowerCase();
      final isImage = mime.startsWith('image/') || (a['fileName'] ?? '').toString().toLowerCase().contains(RegExp(r'\\.(png|jpe?g|gif|webp|bmp|svg)\$'));
      final isInline = (a['inline'] == true);
      return isImage && isInline && a['downloadUrl'] != null;
    }).map((a) => a.cast<String, dynamic>()).toList();
    final Map<String, dynamic>? firstPreviewImage = inlineImages.isNotEmpty
        ? inlineImages.first
        : attachments.whereType<Map<String, dynamic>>().firstWhere(
              (a) => (a['mimeType'] ?? '').toString().toLowerCase().startsWith('image/') && (a['downloadUrl'] ?? '').toString().isNotEmpty,
              orElse: () => <String, dynamic>{},
            );
    final String? firstPreviewUrl = (firstPreviewImage != null && firstPreviewImage.isNotEmpty)
        ? firstPreviewImage['downloadUrl'] as String?
        : null;
    return Scaffold(
      backgroundColor: kAccent,
      appBar: AppBar(
        title: const Text('Detalle del mensaje'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: kPrimary.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Text(
                          _data['reason'] ?? _data['content'] ?? '',
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                            color: kSecondary,
                            height: 1.2,
                            letterSpacing: 0.2,
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text('De: ${_data['senderName'] ?? ''}', style: const TextStyle(color: Colors.black54)),
                      Builder(builder: (_) {
                        final friendlyDate = _formatDateFriendly(_data['createdAt'] as String?);
                        return Text(
                          friendlyDate.isNotEmpty ? 'Fecha: $friendlyDate' : 'Fecha no disponible',
                          style: const TextStyle(color: Colors.black54),
                        );
                      }),
                      const SizedBox(height: 16),
                      MarkdownBody(
                        data: (_data['content'] ?? '').toString(),
                        selectable: true,
                        styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
                          p: const TextStyle(fontSize: 16, height: 1.45, color: Colors.black87),
                          strong: const TextStyle(fontWeight: FontWeight.w800, color: kSecondary),
                          em: const TextStyle(fontStyle: FontStyle.italic, color: kSecondary),
                          del: const TextStyle(decoration: TextDecoration.lineThrough, color: Colors.black54),
                        ),
                        onTapLink: (text, href, title) {
                          if (href == null) return;
                          launchUrl(Uri.parse(href), mode: LaunchMode.externalApplication);
                        },
                      ),
                      const SizedBox(height: 16),
                      if (inlineImages.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        const Text('Imágenes del mensaje', style: TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 6),
                        ...inlineImages.map((img) {
                          final url = img['downloadUrl'] as String?;
                          if (url == null) return const SizedBox.shrink();
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(12),
                              child: Image.network(
                                url,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: Colors.grey.shade200,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: const Text('No se pudo cargar la imagen'),
                                ),
                              ),
                            ),
                          );
                        }),
                      ] else if (firstPreviewUrl != null) ...[
                        const SizedBox(height: 12),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: Image.network(
                            firstPreviewUrl,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.grey.shade200,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Text('No se pudo cargar la imagen'),
                            ),
                          ),
                        ),
                      ],
                      if (attachments.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        const Text('Adjuntos', style: TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        ...attachments.whereType<Map>().map((att) {
                          final url = att['downloadUrl'] as String?;
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.attach_file, color: kPrimary),
                            title: Text(att['fileName'] ?? 'Archivo', maxLines: 1, overflow: TextOverflow.ellipsis),
                            subtitle: Text(att['mimeType'] ?? '', maxLines: 1, overflow: TextOverflow.ellipsis),
                            onTap: url == null ? null : () => launchUrl(Uri.parse(url)),
                          );
                        }),
                      ],
                    ],
                  ),
                ),
    );
  }
}
