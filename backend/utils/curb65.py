def calculate_curb65(confusion, urea, respiratory_rate, systolic_bp, age):
    score = 0
    if confusion: score += 1
    if urea > 7: score += 1
    if respiratory_rate >= 30: score += 1
    if systolic_bp < 90: score += 1
    if age >= 65: score += 1
    return score
