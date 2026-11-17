<?php

function sc_code_public_url(): string {
    return add_query_arg('sc_code_public', '1', home_url('/'));
}

function sc_code_public_shortcode(): string {
    $url = esc_url(sc_code_public_url());
    $help = esc_url(plugins_url('web/help/index.html', dirname(__DIR__) . '/sc-code-public.php'));
    return '<iframe title="SeCuida Code Público" src="' . $url .
        '" style="display:block;width:100%;height:90vh;border:0" allow="clipboard-write; fullscreen" allowfullscreen></iframe>' .
        '<p><a href="' . $url . '">Abrir SeCuida Code Público em tela cheia</a></p>' .
        '<p><a href="' . $help . '">Manuais para alunos e professores</a></p>';
}

function sc_code_public_context(): array {
    $url = sc_code_public_url();
    $logged_in = is_user_logged_in();
    return [
        'appUrl' => $url,
        'restUrl' => rest_url(SC_Code_Public_REST::NS . '/'),
        'nonce' => $logged_in ? wp_create_nonce('wp_rest') : '',
        'siteScope' => substr(hash('sha256', $url), 0, 16),
        'loginUrl' => wp_login_url($url),
        'registerUrl' => (get_option('users_can_register') || is_multisite()) ? wp_registration_url() : '',
        'resetUrl' => wp_lostpassword_url($url),
        'logoutUrl' => $logged_in ? html_entity_decode(wp_logout_url($url), ENT_QUOTES, 'UTF-8') : '',
        'executorUrl' => plugins_url('web/downloads/executor.zip', dirname(__DIR__) . '/sc-code-public.php'),
    ];
}

function sc_code_public_frontend(): void {
    if (($_GET['sc_code_public'] ?? null) !== '1') {
        return;
    }
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, ['GET', 'HEAD'], true)) {
        header('Allow: GET, HEAD');
        status_header(405);
        exit;
    }
    $root = dirname(__DIR__);
    $template = $root . '/web/index.html';
    if (!is_readable($template)) {
        wp_die('O aplicativo está indisponível. Instale o ZIP completo do SeCuida Code Público.', 'SeCuida Code Público', ['response' => 503]);
    }
    $document = file_get_contents($template);
    $bridge = file_get_contents($root . '/router.js');
    $context = wp_json_encode(sc_code_public_context(), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
    $base = plugins_url('web/', $root . '/sc-code-public.php');
    $head = '<base href="' . esc_url($base) . '">' .
        '<script>globalThis.SC_CODE_PUBLIC = ' . $context . ";\n" . $bridge . "</script>\n";
    $document = str_replace('<head>', '<head>' . $head, $document);
    status_header(200);
    nocache_headers();
    header('Cache-Control: no-store, private, max-age=0');
    header('Content-Type: text/html; charset=utf-8');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: no-referrer');
    if ($method === 'GET') {
        echo $document; // The input is the local build with escaped WordPress values.
    }
    exit;
}
