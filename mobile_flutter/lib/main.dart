import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:url_launcher/url_launcher.dart';
import 'firebase_options.dart';

const String apiBase = 'https://notiflow-backend-179964029864.us-central1.run.app';
const Color kPrimary = Color(0xFFFF6B00); // naranjo principal del logo
const Color kSecondary = Color(0xFF0F172A); // gris azulado profundo
const Color kAccent = Color(0xFFFFF6ED); // marfil cálido
const Color kGlow = Color(0xFFFF9E3D); // degradado ámbar
const Duration kTimeout = Duration(seconds: 15);

class StudentOption {
  final String id;
  final String name;
  final String schoolId;
  final String? schoolName;

  StudentOption({required this.id, required this.name, required this.schoolId, this.schoolName});

  factory StudentOption.fromJson(Map<String, dynamic> json) {
    return StudentOption(
      id: json['studentId'] as String? ?? '',
      name: json['fullName'] as String? ?? '',
      schoolId: json['schoolId'] as String? ?? '',
      schoolName: json['schoolName'] as String?,
    );
  }
}

void main() {
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
          color: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          elevation: 4,
          shadowColor: kPrimary.withOpacity(0.12),
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

  Future<void> _bootstrap() async {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    await _initPush();
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('authToken');
    final email = prefs.getString('userEmail');
    final storedName = prefs.getString('userName');
    final storedSchool = prefs.getString('schoolName');
    final hasMultipleStudents = prefs.getBool('hasMultipleStudents') ?? false;
    if (!mounted) return;
    if (token != null && token.isNotEmpty && email != null && email.isNotEmpty) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => HomeShell(
            token: token,
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
        body: jsonEncode({'email': _email.text.trim()}),
      ).timeout(kTimeout);
      if (res.statusCode == 200) {
        setState(() {
          _codeSent = true;
          _infoMessage = 'Te enviamos un código a tu correo. Revisa bandeja y spam.';
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
    });
    try {
      if (_needsStudentChoice && _selectedStudentId == null) {
        throw Exception('Selecciona a qué estudiante corresponde tu correo');
      }
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
        final body = jsonDecode(res.body);
        final opts = (body['options'] as List<dynamic>? ?? [])
            .map((e) => StudentOption.fromJson(e as Map<String, dynamic>))
            .where((o) => o.id.isNotEmpty)
            .toList();
        setState(() {
          _needsStudentChoice = true;
          _options = opts;
          _selectedStudentId = opts.isNotEmpty ? opts.first.id : null;
          _error = null;
          _infoMessage = 'Selecciona el estudiante para continuar';
        });
        return;
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

        if (_selectedStudentId == null && students.length > 1) {
          // Si el backend no devolvió 409 pero hay varios alumnos, pedimos selección igual
          setState(() {
            _needsStudentChoice = true;
            _options = students;
            _selectedStudentId = students.first.id;
            _infoMessage = 'Selecciona el estudiante/apoderado para continuar';
          });
          return;
        }

        final chosenStudent = _selectedStudentId != null
            ? students.firstWhere((s) => s.id == _selectedStudentId, orElse: () => students.isNotEmpty ? students.first : StudentOption(id: '', name: '', schoolId: ''))
            : (students.isNotEmpty ? students.first : StudentOption(id: '', name: '', schoolId: ''));
        final name = (chosenStudent.name.isNotEmpty ? chosenStudent.name : null) ??
            (user?['name'] as String?) ??
            (data['name'] as String?);
        final schoolName = chosenStudent.schoolName ?? user?['schoolName'] as String?;
        final hasMultipleStudents = students.length > 1;
        if (token == null) throw Exception('Token faltante');
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('authToken', token);
        await prefs.setString('userEmail', email);
        if (name != null) await prefs.setString('userName', name);
        if (schoolName != null) await prefs.setString('schoolName', schoolName);
        await prefs.setBool('hasMultipleStudents', hasMultipleStudents);
        await _registerDeviceToken(token, email);
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
    try {
      final fcmToken = await FirebaseMessaging.instance.getToken();
      if (fcmToken == null) return;
      await http.post(
        Uri.parse('$apiBase/devices/register'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({'token': fcmToken, 'platform': 'flutter'}),
      ).timeout(kTimeout);
    } catch (_) {
      // silencioso
    }
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
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: Colors.white.withOpacity(0.12)),
                      ),
                      child: Column(
                        children: [
                          Image.asset('assets/logos/NotiflowV_02.png', width: 170),
                          const SizedBox(height: 6),
                          const Text(
                            'Comunicaciones inteligentes',
                            style: TextStyle(color: Colors.white70, fontSize: 14, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 22),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(18),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.15),
                            blurRadius: 25,
                            offset: const Offset(0, 18),
                          ),
                        ],
                      ),
                      child: Form(
                        key: _formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Text(
                              'Ingresa con tu correo',
                              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: kSecondary),
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              'Te enviaremos un código para validar tu identidad.',
                              style: TextStyle(color: Colors.black54, fontSize: 13),
                            ),
                            const SizedBox(height: 16),
                            TextFormField(
                              controller: _email,
                              keyboardType: TextInputType.emailAddress,
                              decoration: InputDecoration(
                                labelText: 'Correo',
                                prefixIcon: const Icon(Icons.email_outlined),
                                filled: true,
                                fillColor: kAccent,
                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
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
                                decoration: InputDecoration(
                                  labelText: 'Código de 6 dígitos',
                                  prefixIcon: const Icon(Icons.pin_rounded),
                                  counterText: '',
                                  filled: true,
                                  fillColor: kAccent,
                                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                                ),
                              ),
                            if (_needsStudentChoice && _options.isNotEmpty) ...[
                              const SizedBox(height: 12),
                              const Text(
                                'Selecciona el estudiante asociado a tu correo:',
                                style: TextStyle(fontWeight: FontWeight.w700, color: kSecondary),
                              ),
                              const SizedBox(height: 6),
                              ..._options.map(
                                (o) => RadioListTile<String>(
                                  value: o.id,
                                  groupValue: _selectedStudentId,
                                  onChanged: _loading ? null : (v) => setState(() => _selectedStudentId = v),
                                  dense: true,
                                  title: Text(o.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                                  subtitle: Text('Colegio: ${o.schoolName ?? o.schoolId}', style: const TextStyle(color: Colors.black54)),
                                ),
                              ),
                            ],
                            if (_error != null) ...[
                              const SizedBox(height: 10),
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: Colors.red.shade50,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(_error!, style: const TextStyle(color: Colors.red)),
                              ),
                            ],
                            if (_infoMessage != null) ...[
                              const SizedBox(height: 10),
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: kAccent,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  _infoMessage!,
                                  style: const TextStyle(color: kSecondary, fontWeight: FontWeight.w600),
                                ),
                              ),
                            ],
                            const SizedBox(height: 16),
                            ElevatedButton(
                              onPressed: _loading ? null : (_codeSent ? _verifyCode : _requestCode),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: kPrimary,
                                foregroundColor: Colors.white,
                                minimumSize: const Size.fromHeight(50),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                shadowColor: kPrimary.withOpacity(0.35),
                                elevation: 6,
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
                                padding: const EdgeInsets.only(top: 8.0),
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

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  void _logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('authToken');
    await prefs.remove('userEmail');
    await prefs.remove('userName');
    await prefs.remove('schoolName');
    await prefs.remove('hasMultipleStudents');
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginPage()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      MuroPage(token: widget.token),
      CalendarioPage(token: widget.token),
      MessagesPage(token: widget.token, email: widget.email),
    ];
    final titles = ['Muro', 'Calendario', 'Mensajes'];
    final icons = [Icons.campaign_outlined, Icons.event, Icons.message_outlined];

    final schoolLabel = widget.schoolName ??
        (widget.hasMultipleStudents ? 'tus colegios' : 'tu colegio');
    final displayName = widget.studentName ?? widget.userName ?? 'Cuenta';

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      width: 46,
                      height: 46,
                      color: Colors.white,
                      padding: const EdgeInsets.all(2),
                      child: Image.asset('assets/logos/Naranjo_Degradado.png'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Notiflow para $schoolLabel',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: kSecondary),
                        ),
                        Text(
                          displayName,
                          style: const TextStyle(fontSize: 12, color: Colors.black54),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  IconButton(onPressed: _logout, icon: const Icon(Icons.logout, color: kSecondary)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Container(
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Colors.white, kAccent]),
                  borderRadius: BorderRadius.circular(16),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(
                  children: [
                    Icon(icons[_index], color: kPrimary),
                    const SizedBox(width: 8),
                    Text(titles[_index],
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: kSecondary)),
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
  const MuroPage({super.key, required this.token});

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

  bool _isBroadcast(Map msg) {
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
      final res = await http.get(
        Uri.parse('$apiBase/messages'),
        headers: {'Authorization': 'Bearer ${widget.token}'},
      ).timeout(kTimeout);
      if (res.statusCode == 200) {
        data = _extractList(jsonDecode(res.body));
      } else {
        // Fallback: usar mensajes personales y filtrar los masivos
        final resSelf = await http.get(
          Uri.parse('$apiBase/messages?self=true'),
          headers: {'Authorization': 'Bearer ${widget.token}'},
        ).timeout(kTimeout);
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
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
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
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(title,
                                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: kSecondary)),
                                if (dateLabel.isNotEmpty)
                                  Text(dateLabel, style: const TextStyle(color: Colors.black54, fontSize: 12)),
                              ],
                            ),
                          ],
                        ),
                        Chip(
                          label: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.group, size: 14, color: kSecondary),
                              const SizedBox(width: 4),
                              Text('Comunidad', style: TextStyle(color: kSecondary.withOpacity(0.9), fontWeight: FontWeight.w700)),
                            ],
                          ),
                          backgroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    if (preview.isNotEmpty)
                      Text(
                        preview,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 14, color: Colors.black87, height: 1.4),
                      ),
                    if (hasAttachments) ...[
                      const SizedBox(height: 8),
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
  const CalendarioPage({super.key, required this.token});

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

  Future<void> _fetchEvents() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await http
          .get(
            Uri.parse('$apiBase/events'),
            headers: {'Authorization': 'Bearer ${widget.token}'},
          )
          .timeout(kTimeout);
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data is List) {
          setState(() {
            _events = data.cast<Map<String, dynamic>>();
            _dayCounts = _buildDayCounts(_events);
          });
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

  Map<String, int> _buildDayCounts(List<Map<String, dynamic>> events) {
    final map = <String, int>{};
    for (final e in events) {
      final start = (e['startDateTime'] ?? e['createdAt'] ?? '') as String;
      if (start.isEmpty) continue;
      final key = start.length >= 10 ? start.substring(0, 10) : start;
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
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
      final start = (e['startDateTime'] ?? e['createdAt'] ?? '') as String;
      return start.startsWith(key);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final days = _buildCalendarDays(_month);
    final monthLabel = '${_month.year} - ${_month.month.toString().padLeft(2, '0')}';
    final selectedEvents = _eventsForDay(_selectedDay);

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
                        const Text('Tu calendario', style: TextStyle(fontWeight: FontWeight.w700, color: kSecondary)),
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
  const MessagesPage({super.key, required this.token, required this.email});

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

  @override
  void initState() {
    super.initState();
    _loadMessages();
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
      final res = await http.get(
        Uri.parse('$apiBase/messages?self=true'),
        headers: {'Authorization': 'Bearer ${widget.token}'},
      );
      if (res.statusCode == 200) {
        final data = _extractList(jsonDecode(res.body));
        if (!mounted) return;
        setState(() {
          _messages = data;
          _loaded = _messages.length > _pageSize ? _pageSize : _messages.length;
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
        ? const Center(child: CircularProgressIndicator())
        : _error != null
            ? Center(child: Text(_error!))
            : RefreshIndicator(
                onRefresh: _loadMessages,
                child: NotificationListener<ScrollNotification>(
                  onNotification: (notification) {
                    if (notification.metrics.pixels >=
                        notification.metrics.maxScrollExtent - 120) {
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
                      final List<dynamic> readBy = (m['appReadBy'] as List?) ?? [];
                      final bool isRead = readBy.contains(widget.email);
                      final hasAttachments = (m['attachments'] as List?)?.isNotEmpty == true;
                      final contentPreview = (m['content'] ?? '').toString();
                      return AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: [
                            BoxShadow(
                              color: kSecondary.withOpacity(0.06),
                              blurRadius: 12,
                              offset: const Offset(0, 6),
                            ),
                          ],
                          border: Border.all(color: isRead ? Colors.transparent : kPrimary.withOpacity(0.3), width: 1),
                        ),
                        child: ListTile(
                          leading: Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: isRead ? kPrimary.withOpacity(0.12) : kGlow.withOpacity(0.2),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(
                              isRead ? Icons.mark_email_read_outlined : Icons.mark_email_unread_outlined,
                              color: isRead ? kPrimary : kSecondary,
                            ),
                          ),
                          title: Text(m['reason'] ?? m['content'] ?? '',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w800, color: kSecondary)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('De: ${m['senderName'] ?? ''}', style: const TextStyle(color: Colors.black54)),
                              if (contentPreview.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: 2),
                                  child: Text(
                                    contentPreview,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(color: Colors.black87, fontSize: 12),
                                  ),
                                ),
                            ],
                          ),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (hasAttachments)
                                const Icon(Icons.attach_file, color: kSecondary, size: 18),
                              const SizedBox(width: 6),
                              Icon(
                                isRead ? Icons.check_circle : Icons.circle_notifications,
                                color: isRead ? Colors.green : Colors.orange,
                              ),
                            ],
                          ),
                          onTap: () async {
                            Map fullMessage = Map.from(m as Map);
                            try {
                              final res = await http.get(
                                Uri.parse('$apiBase/messages/${m['id']}'),
                                headers: {'Authorization': 'Bearer ${widget.token}'},
                              ).timeout(kTimeout);
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
      await http.post(
        Uri.parse('$apiBase/messages/$id/read'),
        headers: {
          'Authorization': 'Bearer ${widget.token}',
          'Content-Type': 'application/json',
        },
      ).timeout(kTimeout);
      if (!mounted) return;
      setState(() {
        final List<dynamic> updated = List.of(_messages);
        final idx = updated.indexOf(message);
        if (idx != -1) {
          final msg = Map<String, dynamic>.from(updated[idx] as Map);
          final readBy = (msg['appReadBy'] as List?)?.toList() ?? [];
          if (!readBy.contains(widget.email)) readBy.add(widget.email);
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
      final res = await http.get(
        Uri.parse('$apiBase/messages/$id'),
        headers: {
          'Authorization': 'Bearer ${await _tokenFromPrefs() ?? widget.token}',
        },
      ).timeout(kTimeout);
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

  Future<String?> _tokenFromPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('authToken');
  }

  @override
  Widget build(BuildContext context) {
    final attachments = (_data['attachments'] as List?) ?? [];
    final imageAtt = attachments.firstWhere(
      (a) => (a['mimeType'] ?? '').toString().startsWith('image/'),
      orElse: () => null,
    );
    return Scaffold(
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
                      Text(
                        _data['reason'] ?? _data['content'] ?? '',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: kSecondary),
                      ),
                      const SizedBox(height: 8),
                      Text('De: ${_data['senderName'] ?? ''}', style: const TextStyle(color: Colors.black54)),
                      Text('Fecha: ${_data['createdAt'] ?? ''}', style: const TextStyle(color: Colors.black54)),
                      const SizedBox(height: 16),
                      Text(
                        _data['content'] ?? '',
                        style: const TextStyle(fontSize: 16, height: 1.4),
                      ),
                      const SizedBox(height: 16),
                      if (imageAtt != null && imageAtt is Map && imageAtt['downloadUrl'] != null)
                        ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: Image.network(imageAtt['downloadUrl'], fit: BoxFit.cover),
                        ),
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
