<?php
/**
 * Plugin Name: SeCuida Code Público
 * Description: Eventos de programação, editor e tutor de IA para o seu WordPress.
 * Version: 1.0.0
 * Requires at least: 6.5
 * Requires PHP: 8.1
 * Author: SeCuida
 * Text Domain: sc-code-public
 */

if (!defined('ABSPATH')) { exit; }

define('SC_CODE_PUBLIC_VERSION', '1.0.0');

require_once __DIR__ . '/includes/domain.php';
require_once __DIR__ . '/includes/store.php';
require_once __DIR__ . '/includes/ai.php';
require_once __DIR__ . '/includes/game.php';
require_once __DIR__ . '/includes/event-ops.php';
require_once __DIR__ . '/includes/rest.php';
require_once __DIR__ . '/includes/frontend.php';

register_activation_hook(__FILE__, ['SC_Code_Public_Store', 'install']);
add_action('plugins_loaded', static function () {
    if (get_option('sc_code_public_schema') !== SC_CODE_PUBLIC_VERSION) {
        SC_Code_Public_Store::install();
    }
});
add_action('rest_api_init', static function () {
    (new SC_Code_Public_REST())->register();
});
add_shortcode('secuida_code_public', 'sc_code_public_shortcode');
add_action('template_redirect', 'sc_code_public_frontend', 0);

add_action('sc_code_public_receipts_gc', static function () {
    global $wpdb;
    $table = SC_Code_Public_Store::table();
    $wpdb->query($wpdb->prepare(
        "DELETE FROM {$table} WHERE kind IN ('receipt','ai_job') AND parent<%s LIMIT 5000",
        (string) (time() - DAY_IN_SECONDS)
    ));
});
add_action('init', static function () {
    if (!wp_next_scheduled('sc_code_public_receipts_gc')) {
        wp_schedule_event(time() + HOUR_IN_SECONDS, 'hourly', 'sc_code_public_receipts_gc');
    }
});
register_deactivation_hook(__FILE__, static function () {
    wp_clear_scheduled_hook('sc_code_public_receipts_gc');
});
