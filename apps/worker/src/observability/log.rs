pub fn log_event(level: &str, event: &str, fields: &[(&str, String)]) {
    let mut line = format!("{{\"level\":\"{}\",\"event\":\"{}\"", level, event);
    for (k, v) in fields {
        let escaped = v.replace('\\', "\\\\").replace('"', "\\\"");
        line.push_str(&format!(",\"{}\":\"{}\"", k, escaped));
    }
    line.push('}');
    eprintln!("{line}");
}
